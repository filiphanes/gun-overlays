#!/usr/bin/env python3
"""Extract verse text from BibleGateway HTML page (AMPC or other versions)."""
import re
import sys
from html.parser import HTMLParser

class BibleGatewayExtractor(HTMLParser):
    """Parse BibleGateway chapter page and extract clean verse text."""
    
    def __init__(self):
        super().__init__()
        self.verses = []
        self._verse = ""
        self._in_verse = False
        self._skip = 0  # nesting depth for elements to skip
    
    def handle_starttag(self, tag, attrs):
        d = dict(attrs)
        cls = d.get('class', '')
        
        # Start of a verse paragraph
        if tag == 'p' and 'verse' in cls:
            self._in_verse = True
            self._verse = ""
            return
        
        # Skip verse/chapter numbers and cross-references
        if tag in ('sup', 'span'):
            if any(x in cls for x in ('versenum', 'chapternum', 'crossreference', 'footnote')):
                self._skip += 1
            # Also skip <span class="text ..."> opening tag content marker
            elif 'text' in cls and self._in_verse:
                pass  # inner verse text wrapper, still want the text inside
    
    def handle_endtag(self, tag):
        if self._skip > 0 and tag in ('sup', 'span'):
            self._skip -= 1
            return
        
        if tag == 'p' and self._in_verse:
            self._in_verse = False
            text = self._verse.strip()
            if text:
                self.verses.append(text)
    
    def handle_data(self, data):
        if self._in_verse and self._skip == 0:
            self._verse += data

def extract_verses_from_html(html: str) -> list[str]:
    """Parse BibleGateway HTML and return array of verse texts."""
    # Find the verse content div
    match = re.search(
        r'<div[^>]*class="[^"]*version-AMPC[^"]*result-text-style-normal[^"]*text-html[^"]*"[^>]*>(.*?)</div>\s*<div class="publisher-info',
        html, re.DOTALL
    )
    if not match:
        # try broader match
        match = re.search(
            r'<div[^>]*class="[^"]*text-html[^"]*"[^>]*>(.*?)</div>\s*<div class="publisher-info',
            html, re.DOTALL
        )
    if not match:
        print("ERROR: Could not find verse content div", file=sys.stderr)
        return []
    
    verse_html = match.group(1)
    
    # Before parsing, clean up HTML entities that might confuse the parser
    # The HTML from BibleGateway uses some special entities
    verse_html = verse_html.replace('&nbsp;', ' ')
    
    extractor = BibleGatewayExtractor()
    extractor.feed(verse_html)
    return extractor.verses


if __name__ == '__main__':
    import sys
    if len(sys.argv) > 1:
        with open(sys.argv[1]) as f:
            html = f.read()
    else:
        html = sys.stdin.read()
    
    verses = extract_verses_from_html(html)
    for i, v in enumerate(verses, 1):
        print(f"{i}\t{v}")
    
    if verses:
        print(f"\n--- Extracted {len(verses)} verses ---", file=sys.stderr)
    else:
        print("WARNING: No verses extracted", file=sys.stderr)
