#!/usr/bin/env python3
"""
Download the full AMPC (Amplified Bible Classic Edition) from BibleGateway
and save as static JSON files compatible with the Bible overlay app.

Usage: python3 download_ampc.py [--resume] [--book BOOK]
  --resume    Skip already-downloaded books
  --book NAME Only download one specific book

Output: /workspace/bible/ampc/{abbreviation}.json
        Each file is { chapterNumber: [verseText, ...], ... }
"""

import json
import os
import re
import sys
import time
import urllib.request
import urllib.parse
from concurrent.futures import ThreadPoolExecutor, as_completed

# ---- config ----
OUTPUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'bible', 'ampc')
BASE_URL = "https://www.biblegateway.com/passage/"
DELAY = 0.6  # seconds between requests
WORKERS = 3  # parallel fetchers

# Books list matching the amp.json.js abbreviation scheme
BOOKS = [
    ("Genesis", "gn", 50),
    ("Exodus", "ex", 40),
    ("Leviticus", "lv", 27),
    ("Numbers", "nm", 36),
    ("Deuteronomy", "dt", 34),
    ("Joshua", "joz", 24),
    ("Judges", "sdc", 21),
    ("Ruth", "rut", 4),
    ("1 Samuel", "1sm", 31),
    ("2 Samuel", "2sm", 24),
    ("1 Kings", "1kr", 22),
    ("2 Kings", "2kr", 25),
    ("1 Chronicles", "1krn", 29),
    ("2 Chronicles", "2krn", 36),
    ("Ezra", "ezd", 10),
    ("Nehemiah", "neh", 13),
    ("Esther", "est", 10),
    ("Job", "job", 42),
    ("Psalm", "z", 150),
    ("Proverbs", "pr", 31),
    ("Ecclesiastes", "kaz", 12),
    ("Song of Solomon", "pis", 8),
    ("Isaiah", "iz", 66),
    ("Jeremiah", "jer", 52),
    ("Lamentations", "nar", 5),
    ("Ezekiel", "ez", 48),
    ("Daniel", "dan", 12),
    ("Hosea", "oz", 14),
    ("Joel", "jl", 3),
    ("Amos", "am", 9),
    ("Obadiah", "abd", 1),
    ("Jonah", "jon", 4),
    ("Micah", "mich", 7),
    ("Nahum", "nah", 3),
    ("Habakkuk", "hab", 3),
    ("Zephaniah", "sof", 3),
    ("Haggai", "hag", 2),
    ("Zechariah", "zach", 14),
    ("Malachi", "mal", 4),
    ("Matthew", "mt", 28),
    ("Mark", "mk", 16),
    ("Luke", "lk", 24),
    ("John", "jn", 21),
    ("Acts", "sk", 28),
    ("Romans", "rim", 16),
    ("1 Corinthians", "1kor", 16),
    ("2 Corinthians", "2kor", 13),
    ("Galatians", "gal", 6),
    ("Ephesians", "ef", 6),
    ("Philippians", "fp", 4),
    ("Colossians", "kol", 4),
    ("1 Thessalonians", "1tes", 5),
    ("2 Thessalonians", "2tes", 3),
    ("1 Timothy", "1tim", 6),
    ("2 Timothy", "2tim", 4),
    ("Titus", "tit", 3),
    ("Philemon", "fm", 1),
    ("Hebrews", "heb", 13),
    ("James", "jak", 5),
    ("1 Peter", "1pt", 5),
    ("2 Peter", "2pt", 3),
    ("1 John", "1jn", 5),
    ("2 John", "2jn", 1),
    ("3 John", "3jn", 1),
    ("Jude", "jud", 1),
    ("Revelation", "zj", 22),
]

TOTAL_CHAPTERS = sum(b[2] for b in BOOKS)


def clean_verse_text(text):
    """Strip HTML tags, decode entities, collapse whitespace."""
    # Remove cross-reference/footnote sup elements entirely (including their content).
    # Handles both " and ' quote styles in class attributes.
    text = re.sub(r"<sup[^>]*class=[\"'][^\"']*(?:crossreference|footnote)[^\"']*[\"'][^>]*>.*?</sup>", '', text, flags=re.DOTALL)
    # Remove other HTML tags
    text = re.sub(r'<[^>]+>', '', text)
    # Decode common HTML entities
    text = text.replace('&nbsp;', ' ')
    text = text.replace('&amp;', '&')
    text = text.replace('&lt;', '<')
    text = text.replace('&gt;', '>')
    text = text.replace('&#39;', "'")
    text = text.replace('&quot;', '"')
    text = text.replace('&ldquo;', '"')
    text = text.replace('&rdquo;', '"')
    text = text.replace('&lsquo;', "'")
    text = text.replace('&rsquo;', "'")
    text = text.replace('&mdash;', '—')
    text = text.replace('&ndash;', '–')
    # Collapse whitespace
    text = re.sub(r'\s+', ' ', text)
    text = text.strip()
    # Remove leading verse number if present (some verses have "1 text" after tag stripping)
    text = re.sub(r'^\d+\s+', '', text, count=1)
    return text


def extract_verses_from_html(html, chapter_override=None):
    """Extract chapter→verse mapping from BibleGateway print HTML page.
    
    If chapter_override is given, all verses are assigned to that chapter
    (single-chapter pages always use 'chapter-1' in their CSS class).
    """
    # Find the verse content section
    pattern = r'<div[^>]*class="[^"]*version-AMPC[^"]*result-text-style-normal[^"]*text-html[^"]*"[^>]*>(.*?)</div>\s*<div class="publisher-info'
    match = re.search(pattern, html, re.DOTALL)
    if not match:
        # Try broader match
        pattern2 = r'<div[^>]*class="[^"]*text-html[^"]*"[^>]*>(.*?)<div class="publisher-info'
        match = re.search(pattern2, html, re.DOTALL)
    if not match:
        raise ValueError("Could not find verse content")
    
    verse_html = match.group(1)
    
    # Parse each verse paragraph
    result = {}  # chapter_num -> [verse_text, ...]
    current_chapter = chapter_override
    
    for p_match in re.finditer(r'<p class="verse( chapter-(\d+))?">(.*?)</p>', verse_html, re.DOTALL):
        chapter_attr = p_match.group(2)
        verse_content = p_match.group(3)
        
        if chapter_attr:
            css_chapter = int(chapter_attr)
            if current_chapter is None:
                current_chapter = css_chapter
            # Note: on single-chapter pages, css_chapter is always 1.
            # We prefer chapter_override when given.
        
        if current_chapter is None:
            current_chapter = 1  # fallback
        
        result.setdefault(current_chapter, [])
        
        verse_text = clean_verse_text(verse_content)
        if verse_text:
            result[current_chapter].append(verse_text)
    
    return result


def fetch_chapter(book_name, chapter):
    """Fetch one chapter from BibleGateway and return {chapter: [verses]}."""
    url = f"{BASE_URL}?version=AMPC&search={urllib.parse.quote(book_name)}+{chapter}&interface=print"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (compatible; BibleDownloader/1.0)"})
    
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                html = resp.read().decode('utf-8', errors='replace')
            return extract_verses_from_html(html, chapter_override=chapter)
        except Exception as e:
            if attempt < 2:
                time.sleep(2 * (attempt + 1))
            else:
                raise e


def fetch_chapter_range(book_name, ch_start, ch_end):
    """Fetch a range of chapters (at most 2 per request on BibleGateway)."""
    # BibleGateway limits to ~2 chapters. We'll use pairwise fetching.
    result = {}
    for ch in range(ch_start, ch_end + 1):
        if ch not in result:
            chapter_data = fetch_chapter(book_name, ch)
            result.update(chapter_data)
            time.sleep(DELAY)
    return result


def download_book(book_name, abbr, chapter_count):
    """Download all chapters for a single book and save as JSON."""
    filepath = os.path.join(OUTPUT_DIR, f"{abbr}.json")
    
    # Check if already downloaded
    if os.path.exists(filepath):
        with open(filepath) as f:
            existing = json.load(f)
        if len(existing) >= chapter_count:
            print(f"  ✓ {book_name} ({abbr}): already complete ({len(existing)}/{chapter_count} chapters)")
            return True
    
    print(f"  Downloading {book_name} ({abbr}): {chapter_count} chapters...")
    
    book_data = {}
    for ch in range(1, chapter_count + 1):
        try:
            chapter_data = fetch_chapter(book_name, ch)
            book_data.update(chapter_data)
            # Progress indicator
            if ch % 5 == 0 or ch == chapter_count:
                print(f"    {book_name} ch {ch}/{chapter_count}")
        except Exception as e:
            print(f"    ERROR at {book_name} chapter {ch}: {e}")
            # Save progress so far
            if book_data:
                os.makedirs(OUTPUT_DIR, exist_ok=True)
                with open(filepath, 'w') as f:
                    json.dump(book_data, f, ensure_ascii=False)
            return False
    
    # Save
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    with open(filepath, 'w') as f:
        json.dump(book_data, f, ensure_ascii=False)
    
    print(f"  ✓ {book_name} ({abbr}): saved {len(book_data)} chapters")
    return True


def main():
    resume = '--resume' in sys.argv
    specific_book = None
    for i, arg in enumerate(sys.argv[1:]):
        if arg == '--book' and i + 2 < len(sys.argv):
            specific_book = sys.argv[i + 2]
    
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    
    if specific_book:
        books_to_download = [b for b in BOOKS if b[1] == specific_book or b[0].lower() == specific_book.lower()]
        if not books_to_download:
            print(f"Book '{specific_book}' not found. Available: {[(b[1], b[0]) for b in BOOKS]}")
            sys.exit(1)
    else:
        books_to_download = BOOKS
    
    print(f"AMPC Downloader")
    print(f"  Output: {OUTPUT_DIR}")
    print(f"  Books to process: {len(books_to_download)}")
    print(f"  Total chapters: {sum(b[2] for b in books_to_download)}")
    print(f"  Delay: {DELAY}s per request")
    print()
    
    start_time = time.time()
    success = 0
    fail = 0
    
    for book_name, abbr, ch_count in books_to_download:
        filepath = os.path.join(OUTPUT_DIR, f"{abbr}.json")
        if resume and os.path.exists(filepath):
            with open(filepath) as f:
                existing = json.load(f)
            if len(existing) >= ch_count:
                print(f"  ✓ {book_name} ({abbr}): skipping (already complete)")
                success += 1
                continue
        
        if download_book(book_name, abbr, ch_count):
            success += 1
        else:
            fail += 1
            if not resume:
                print(f"  Stopping after failure. Use --resume to continue.")
                break
    
    elapsed = time.time() - start_time
    print(f"\nDone! Success: {success}, Failed: {fail}, Time: {elapsed:.1f}s")


if __name__ == '__main__':
    main()
