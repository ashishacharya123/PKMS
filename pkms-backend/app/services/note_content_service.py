"""
Note Content Service

Handles content parsing, analysis, link extraction, markdown processing,
and content validation for notes.
"""

import logging
import re
from typing import List, Optional, Dict, Any, Set, Tuple
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_

from app.models.link import Link
from app.models.note import Note
from app.utils.security import sanitize_text_input

logger = logging.getLogger(__name__)


class NoteContentService:
    """Service for note content processing and analysis"""
    
    def __init__(self):
        # URL pattern for link extraction (ReDoS safe)
        self.url_pattern = re.compile(
            r'https?://[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(?:/[^\s]*)?',
            re.IGNORECASE
        )
        
        # Markdown patterns
        self.markdown_patterns = {
            'bold': re.compile(r'\*\*(.*?)\*\*'),
            'italic': re.compile(r'\*(.*?)\*'),
            'code': re.compile(r'`(.*?)`'),
            'code_block': re.compile(r'```(.*?)```', re.DOTALL),
            'headers': re.compile(r'^#{1,6}\s+(.*)$', re.MULTILINE),
            'links': re.compile(r'\[([^\]]+)\]\(([^)]+)\)'),
            'lists': re.compile(r'^[\s]*[-*+]\s+(.*)$', re.MULTILINE),
        }
    
    async def process_note_content(
        self, 
        db: AsyncSession, 
        note: Note, 
        content: str, 
        user_uuid: str
    ) -> Dict[str, Any]:
        """
        Process note content and extract various elements.
        
        Returns:
            Dictionary with extracted content analysis
        """
        try:
            # Sanitize content
            sanitized_content = sanitize_text_input(content)
            
            # Extract various content elements
            analysis = {
                'word_count': self._count_words(sanitized_content),
                'character_count': len(sanitized_content),
                'line_count': len(sanitized_content.splitlines()),
                'urls': self._extract_urls(sanitized_content),
                'markdown_elements': self._analyze_markdown(sanitized_content),
                'mentions': self._extract_mentions(sanitized_content),
                'hashtags': self._extract_hashtags(sanitized_content),
                'reading_time_minutes': self._estimate_reading_time(sanitized_content),
                'content_type': self._detect_content_type(sanitized_content),
            }
            
            # Process and store links
            if analysis['urls']:
                await self._process_links(db, note, analysis['urls'], user_uuid)
            
            return analysis
            
        except Exception as e:
            logger.exception(f"Error processing content for note {note.uuid}")
            return {
                'word_count': 0,
                'character_count': len(content),
                'line_count': 1,
                'urls': [],
                'markdown_elements': {},
                'mentions': [],
                'hashtags': [],
                'reading_time_minutes': 0,
                'content_type': 'text',
                'error': str(e)
            }
    
    def _count_words(self, content: str) -> int:
        """Count words in content"""
        if not content:
            return 0
        
        # Remove markdown syntax for accurate word count
        clean_content = self._strip_markdown(content)
        words = clean_content.split()
        return len([word for word in words if word.strip()])
    
    def _extract_urls(self, content: str) -> List[str]:
        """Extract URLs from content"""
        if not content:
            return []
        
        urls = self.url_pattern.findall(content)
        # Remove duplicates while preserving order
        seen = set()
        unique_urls = []
        for url in urls:
            if url not in seen:
                seen.add(url)
                unique_urls.append(url)
        
        return unique_urls
    
    def _analyze_markdown(self, content: str) -> Dict[str, Any]:
        """Analyze markdown elements in content"""
        if not content:
            return {}
        
        analysis = {}
        
        for element, pattern in self.markdown_patterns.items():
            matches = pattern.findall(content)
            analysis[element] = {
                'count': len(matches),
                'content': matches[:5] if matches else []  # First 5 examples
            }
        
        # Additional markdown analysis
        analysis['has_code'] = bool(analysis.get('code', {}).get('count', 0) > 0)
        analysis['has_headers'] = bool(analysis.get('headers', {}).get('count', 0) > 0)
        analysis['has_lists'] = bool(analysis.get('lists', {}).get('count', 0) > 0)
        analysis['has_links'] = bool(analysis.get('links', {}).get('count', 0) > 0)
        
        return analysis
    
    def _extract_mentions(self, content: str) -> List[str]:
        """Extract @mentions from content"""
        if not content:
            return []
        
        mention_pattern = re.compile(r'@([a-zA-Z0-9_]+)')
        mentions = mention_pattern.findall(content)
        return list(set(mentions))  # Remove duplicates
    
    def _extract_hashtags(self, content: str) -> List[str]:
        """Extract #hashtags from content"""
        if not content:
            return []
        
        hashtag_pattern = re.compile(r'#([a-zA-Z0-9_]+)')
        hashtags = hashtag_pattern.findall(content)
        return list(set(hashtags))  # Remove duplicates
    
    def _estimate_reading_time(self, content: str) -> int:
        """Estimate reading time in minutes (average 200 words per minute)"""
        word_count = self._count_words(content)
        return max(1, round(word_count / 200))
    
    def _detect_content_type(self, content: str) -> str:
        """Detect the type of content based on patterns"""
        if not content:
            return 'empty'
        
        # Check for code blocks
        if '```' in content:
            return 'code'
        
        # Check for markdown
        if any(pattern.search(content) for pattern in self.markdown_patterns.values()):
            return 'markdown'
        
        # Check for structured content (lists, headers)
        if re.search(r'^[\s]*[-*+]\s+', content, re.MULTILINE) or re.search(r'^#{1,6}\s+', content, re.MULTILINE):
            return 'structured'
        
        # Check for URLs
        if self.url_pattern.search(content):
            return 'link_rich'
        
        return 'text'
    
    def _strip_markdown(self, content: str) -> str:
        """Remove markdown syntax for clean text analysis"""
        if not content:
            return ""
        
        # Remove code blocks
        content = re.sub(r'```.*?```', '', content, flags=re.DOTALL)
        
        # Remove inline code
        content = re.sub(r'`([^`]+)`', r'\1', content)
        
        # Remove bold/italic
        content = re.sub(r'\*\*(.*?)\*\*', r'\1', content)
        content = re.sub(r'\*(.*?)\*', r'\1', content)
        
        # Remove headers
        content = re.sub(r'^#{1,6}\s+', '', content, flags=re.MULTILINE)
        
        # Remove links (keep text)
        content = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', content)
        
        # Remove list markers
        content = re.sub(r'^[\s]*[-*+]\s+', '', content, flags=re.MULTILINE)
        
        return content.strip()
    
    async def _process_links(
        self, 
        db: AsyncSession, 
        note: Note, 
        urls: List[str], 
        user_uuid: str
    ) -> None:
        """Process and store extracted URLs as Link entities"""
        try:
            for url in urls:
                # Check if link already exists
                existing_link = await db.execute(
                    select(Link).where(and_(Link.url == url, Link.created_by == user_uuid))
                )
                
                if not existing_link.scalar_one_or_none():
                    # Create new link
                    link = Link(
                        title=f"Link from note: {note.title}",
                        url=url,
                        description=f"Found in note '{note.title}'",
                        created_by=user_uuid,
                        source_type='note',
                        source_uuid=note.uuid
                    )
                    db.add(link)
                    logger.debug(f"Created new link for note {note.uuid}: {url}")
                    
        except Exception as e:
            logger.exception(f"Error processing links for note {note.uuid}")
            # Don't raise - link processing is not critical
    
    def validate_content(self, content: str) -> Dict[str, Any]:
        """
        Validate note content for quality and security.
        
        Returns:
            Dictionary with validation results
        """
        validation = {
            'is_valid': True,
            'warnings': [],
            'errors': [],
            'suggestions': []
        }
        
        if not content or not content.strip():
            validation['warnings'].append("Content is empty")
            return validation
        
        # Check content length
        if len(content) > 100000:  # 100KB limit
            validation['errors'].append("Content too long (max 100KB)")
            validation['is_valid'] = False
        
        # Check for suspicious patterns
        suspicious_patterns = [
            r'<script[^>]*>.*?</script>',  # Script tags
            r'javascript:',  # JavaScript URLs
            r'data:text/html',  # Data URLs
        ]
        
        for pattern in suspicious_patterns:
            if re.search(pattern, content, re.IGNORECASE | re.DOTALL):
                validation['errors'].append("Content contains potentially unsafe elements")
                validation['is_valid'] = False
                break
        
        # Check for very long lines (potential spam)
        lines = content.splitlines()
        for i, line in enumerate(lines):
            if len(line) > 1000:
                validation['warnings'].append(f"Line {i+1} is very long ({len(line)} characters)")
        
        # Check for excessive repetition
        words = content.lower().split()
        if len(words) > 10:
            word_counts = {}
            for word in words:
                word_counts[word] = word_counts.get(word, 0) + 1
            
            max_repetition = max(word_counts.values())
            if max_repetition > len(words) * 0.3:  # More than 30% repetition
                validation['warnings'].append("Content has excessive word repetition")
        
        # Suggestions for improvement
        if len(content) < 50:
            validation['suggestions'].append("Consider adding more detail to your note")
        
        if not any(char in content for char in '.!?'):
            validation['suggestions'].append("Consider adding punctuation for better readability")
        
        return validation
    
    def extract_preview(self, content: str, max_length: int = 200) -> str:
        """
        Extract a clean preview of the content.
        
        Args:
            content: Original content
            max_length: Maximum length of preview
            
        Returns:
            Clean preview text
        """
        if not content:
            return ""
        
        # Strip markdown and get clean text
        clean_content = self._strip_markdown(content)
        
        # Remove extra whitespace
        clean_content = re.sub(r'\s+', ' ', clean_content).strip()
        
        # Truncate if needed
        if len(clean_content) <= max_length:
            return clean_content
        
        # Find a good break point
        truncated = clean_content[:max_length]
        last_space = truncated.rfind(' ')
        
        if last_space > max_length * 0.8:  # If we can break at a word
            return truncated[:last_space] + "..."
        else:
            return truncated + "..."
    
    def get_content_statistics(self, content: str) -> Dict[str, Any]:
        """
        Get comprehensive content statistics.
        
        Returns:
            Dictionary with detailed content analysis
        """
        if not content:
            return {
                'word_count': 0,
                'character_count': 0,
                'line_count': 0,
                'paragraph_count': 0,
                'sentence_count': 0,
                'reading_time_minutes': 0,
                'content_type': 'empty'
            }
        
        # Basic counts
        word_count = self._count_words(content)
        character_count = len(content)
        line_count = len(content.splitlines())
        
        # Paragraph count (double newlines)
        paragraphs = [p for p in content.split('\n\n') if p.strip()]
        paragraph_count = len(paragraphs)
        
        # Sentence count (rough estimate)
        sentences = re.split(r'[.!?]+', content)
        sentence_count = len([s for s in sentences if s.strip()])
        
        return {
            'word_count': word_count,
            'character_count': character_count,
            'line_count': line_count,
            'paragraph_count': paragraph_count,
            'sentence_count': sentence_count,
            'reading_time_minutes': self._estimate_reading_time(content),
            'content_type': self._detect_content_type(content),
            'has_urls': bool(self._extract_urls(content)),
            'has_mentions': bool(self._extract_mentions(content)),
            'has_hashtags': bool(self._extract_hashtags(content)),
            'markdown_elements': self._analyze_markdown(content)
        }


# Global instance
note_content_service = NoteContentService()
