"""
AI Service - Smart Tagging and Content Analysis
Uses Transformers for automatic content tagging, summarization, and content analysis
"""

import asyncio
from typing import List, Dict, Optional, Tuple, Any
import logging
import re
from datetime import datetime

try:
    from transformers import pipeline
    TRANSFORMERS_AVAILABLE = True
    SENTENCE_TRANSFORMERS_AVAILABLE = False  # Disabled - requires PyTorch
except ImportError:
    TRANSFORMERS_AVAILABLE = False
    SENTENCE_TRANSFORMERS_AVAILABLE = False

logger = logging.getLogger(__name__)

class AIService:
    """AI service for smart content analysis and tagging"""
    
    def __init__(self):
        self.enabled = TRANSFORMERS_AVAILABLE
        self.models_loaded = False
        self.text_classifier = None
        self.summarizer = None
        self.similarity_model = None
        self.sentiment_analyzer = None
        
        # Predefined category mappings for smart tagging
        self.category_tags = {
            'work': ['work', 'job', 'career', 'business', 'professional', 'meeting', 'project'],
            'personal': ['personal', 'life', 'family', 'friends', 'relationship', 'health'],
            'education': ['education', 'learning', 'study', 'research', 'academic', 'course'],
            'finance': ['finance', 'money', 'budget', 'investment', 'expense', 'income'],
            'health': ['health', 'fitness', 'medical', 'wellness', 'exercise', 'nutrition'],
            'travel': ['travel', 'trip', 'vacation', 'journey', 'destination', 'adventure'],
            'technology': ['technology', 'tech', 'software', 'programming', 'computer', 'digital'],
            'creative': ['creative', 'art', 'design', 'writing', 'music', 'photography'],
            'hobby': ['hobby', 'interest', 'fun', 'entertainment', 'leisure', 'passion']
        }
        
        # Don't load models at initialization - they will be loaded lazily when needed
    
    async def _load_models(self):
        """Load AI models asynchronously"""
        try:
            logger.info("Loading AI models for smart tagging...")
            
            # Load classification pipeline for content categorization
            self.text_classifier = pipeline(
                "zero-shot-classification",
                model="facebook/bart-large-mnli",
                device=-1  # Use CPU
            )
            
            # Load summarization pipeline
            self.summarizer = pipeline(
                "summarization",
                model="facebook/bart-large-cnn",
                device=-1,
                max_length=100,
                min_length=20
            )
            
            # Load sentiment analysis
            self.sentiment_analyzer = pipeline(
                "sentiment-analysis",
                model="cardiffnlp/twitter-roberta-base-sentiment-latest",
                device=-1
            )
            
            # Sentence transformers disabled (requires PyTorch)
            self.similarity_model = None  # Would need: SentenceTransformer('all-MiniLM-L6-v2')
            
            self.models_loaded = True
            logger.info("✅ AI models loaded successfully")
            
        except Exception as e:
            logger.error(f"❌ Failed to load AI models: {e}")
            self.enabled = False
    
    async def analyze_content(self, text: str, content_type: str = "general") -> Dict[str, Any]:
        """
        Comprehensive content analysis
        
        Args:
            text: Content to analyze
            content_type: Type of content (note, document, diary, data)
        
        Returns:
            Analysis results including tags, sentiment, summary, etc.
        """
        if not self.enabled:
            return self._fallback_analysis(text, content_type)
            
        # Lazy load models if needed
        if not self.models_loaded:
            await self._load_models()
            
        if not self.models_loaded:
            return self._fallback_analysis(text, content_type)
        
        try:
            # Run analysis tasks concurrently
            tasks = [
                self._extract_smart_tags(text, content_type),
                self._analyze_sentiment(text),
                self._generate_summary(text),
                self._extract_topics(text)
            ]
            
            tags, sentiment, summary, topics = await asyncio.gather(*tasks, return_exceptions=True)
            
            # Handle any exceptions
            if isinstance(tags, Exception):
                tags = self._fallback_tags(text)
            if isinstance(sentiment, Exception):
                sentiment = {"label": "NEUTRAL", "score": 0.5}
            if isinstance(summary, Exception):
                summary = text[:200] + "..." if len(text) > 200 else text
            if isinstance(topics, Exception):
                topics = []
            
            return {
                "tags": tags,
                "sentiment": sentiment,
                "summary": summary,
                "topics": topics,
                "analysis_timestamp": datetime.utcnow().isoformat(),
                "content_type": content_type
            }
            
        except Exception as e:
            logger.error(f"Content analysis failed: {e}")
            return self._fallback_analysis(text, content_type)
    
    async def _extract_smart_tags(self, text: str, content_type: str) -> List[str]:
        """Extract smart tags using text classification"""
        if not self.text_classifier:
            return self._fallback_tags(text)
        
        try:
            # Clean and prepare text
            clean_text = self._clean_text(text)
            if len(clean_text.split()) < 3:
                return self._fallback_tags(text)
            
            # Classify content into categories
            categories = list(self.category_tags.keys())
            result = self.text_classifier(clean_text, categories)
            
            tags = []
            
            # Add high-confidence category tags
            for label, score in zip(result['labels'], result['scores']):
                if score > 0.3:  # Confidence threshold
                    tags.extend(self.category_tags.get(label, [label])[:2])  # Max 2 tags per category
            
            # Add keyword-based tags
            keyword_tags = self._extract_keyword_tags(clean_text)
            tags.extend(keyword_tags)
            
            # Add content-type specific tags
            if content_type == "diary":
                diary_tags = self._extract_diary_tags(clean_text)
                tags.extend(diary_tags)
            elif content_type == "document":
                doc_tags = self._extract_document_tags(clean_text)
                tags.extend(doc_tags)
            elif content_type == "data":
                data_tags = self._extract_data_tags(clean_text)
                tags.extend(data_tags)
            
            # Remove duplicates and limit
            unique_tags = list(dict.fromkeys(tags))[:10]  # Max 10 tags
            
            return unique_tags
            
        except Exception as e:
            logger.error(f"Smart tag extraction failed: {e}")
            return self._fallback_tags(text)
    
    async def _analyze_sentiment(self, text: str) -> Dict[str, Any]:
        """Analyze sentiment of the text"""
        if not self.sentiment_analyzer:
            return {"label": "NEUTRAL", "score": 0.5}
        
        try:
            clean_text = self._clean_text(text)[:500]  # Limit text length
            result = self.sentiment_analyzer(clean_text)[0]
            
            # Normalize labels
            label_mapping = {
                "LABEL_0": "NEGATIVE", "LABEL_1": "NEUTRAL", "LABEL_2": "POSITIVE",
                "NEGATIVE": "NEGATIVE", "NEUTRAL": "NEUTRAL", "POSITIVE": "POSITIVE"
            }
            
            return {
                "label": label_mapping.get(result["label"], result["label"]),
                "score": result["score"]
            }
            
        except Exception as e:
            logger.error(f"Sentiment analysis failed: {e}")
            return {"label": "NEUTRAL", "score": 0.5}
    
    async def _generate_summary(self, text: str) -> str:
        """Generate a summary of the text"""
        if not self.summarizer or len(text.split()) < 50:
            return text[:200] + "..." if len(text) > 200 else text
        
        try:
            clean_text = self._clean_text(text)
            if len(clean_text.split()) < 50:
                return clean_text[:200] + "..." if len(clean_text) > 200 else clean_text
            
            # Summarize in chunks if text is too long
            max_chunk_length = 1000
            if len(clean_text) <= max_chunk_length:
                result = self.summarizer(clean_text, max_length=100, min_length=20, do_sample=False)
                return result[0]['summary_text']
            else:
                # Split into chunks and summarize
                chunks = [clean_text[i:i+max_chunk_length] for i in range(0, len(clean_text), max_chunk_length)]
                summaries = []
                
                for chunk in chunks[:3]:  # Limit to first 3 chunks
                    if len(chunk.split()) >= 20:
                        result = self.summarizer(chunk, max_length=50, min_length=10, do_sample=False)
                        summaries.append(result[0]['summary_text'])
                
                return " ".join(summaries) if summaries else clean_text[:200] + "..."
            
        except Exception as e:
            logger.error(f"Summarization failed: {e}")
            return text[:200] + "..." if len(text) > 200 else text
    
    async def _extract_topics(self, text: str) -> List[str]:
        """Extract main topics from text"""
        try:
            # Simple topic extraction using keyword frequency
            clean_text = self._clean_text(text.lower())
            words = re.findall(r'\b[a-zA-Z]{4,}\b', clean_text)  # Words with 4+ characters
            
            # Count word frequency
            word_freq = {}
            for word in words:
                if word not in ['that', 'this', 'with', 'have', 'will', 'been', 'from', 'they', 'were', 'said']:
                    word_freq[word] = word_freq.get(word, 0) + 1
            
            # Get top topics
            topics = sorted(word_freq.items(), key=lambda x: x[1], reverse=True)[:5]
            return [topic[0] for topic in topics if topic[1] > 1]
            
        except Exception as e:
            logger.error(f"Topic extraction failed: {e}")
            return []
    
    def _clean_text(self, text: str) -> str:
        """Clean and normalize text for analysis"""
        # Remove markdown formatting
        text = re.sub(r'[#*`\[\]()]', ' ', text)
        # Remove extra whitespace
        text = re.sub(r'\s+', ' ', text)
        # Remove special characters but keep basic punctuation
        text = re.sub(r'[^\w\s.,!?-]', ' ', text)
        return text.strip()
    
    def _fallback_analysis(self, text: str, content_type: str) -> Dict[str, Any]:
        """Fallback analysis when AI models are not available"""
        return {
            "tags": self._fallback_tags(text),
            "sentiment": {"label": "NEUTRAL", "score": 0.5},
            "summary": text[:200] + "..." if len(text) > 200 else text,
            "topics": [],
            "analysis_timestamp": datetime.utcnow().isoformat(),
            "content_type": content_type,
            "fallback": True
        }
    
    def _fallback_tags(self, text: str) -> List[str]:
        """Simple keyword-based tagging fallback"""
        tags = []
        text_lower = text.lower()
        
        # Check for category keywords
        for category, keywords in self.category_tags.items():
            for keyword in keywords:
                if keyword in text_lower:
                    tags.append(category)
                    break
        
        # Add keyword tags
        keyword_tags = self._extract_keyword_tags(text)
        tags.extend(keyword_tags)
        
        return list(dict.fromkeys(tags))[:5]  # Remove duplicates, max 5 tags
    
    def _extract_keyword_tags(self, text: str) -> List[str]:
        """Extract tags based on important keywords"""
        tags = []
        text_lower = text.lower()
        
        keyword_mappings = {
            'meeting': ['meeting', 'call', 'conference', 'discussion'],
            'project': ['project', 'task', 'deadline', 'milestone'],
            'idea': ['idea', 'concept', 'brainstorm', 'inspiration'],
            'important': ['important', 'urgent', 'critical', 'priority'],
            'review': ['review', 'feedback', 'evaluation', 'assessment'],
            'plan': ['plan', 'strategy', 'goal', 'objective'],
            'research': ['research', 'study', 'analysis', 'investigation'],
            'note': ['note', 'reminder', 'memo', 'information']
        }
        
        for tag, keywords in keyword_mappings.items():
            if any(keyword in text_lower for keyword in keywords):
                tags.append(tag)
        
        return tags
    
    def _extract_diary_tags(self, text: str) -> List[str]:
        """Extract diary-specific tags"""
        tags = []
        text_lower = text.lower()
        
        diary_keywords = {
            'reflection': ['reflect', 'thinking', 'pondering', 'consider'],
            'gratitude': ['grateful', 'thankful', 'appreciate', 'blessed'],
            'mood': ['happy', 'sad', 'excited', 'worried', 'calm', 'stressed'],
            'memory': ['remember', 'recall', 'memory', 'flashback'],
            'dream': ['dream', 'nightmare', 'sleep', 'dreamed']
        }
        
        for tag, keywords in diary_keywords.items():
            if any(keyword in text_lower for keyword in keywords):
                tags.append(tag)
        
        return tags
    
    def _extract_document_tags(self, text: str) -> List[str]:
        """Extract document-specific tags"""
        tags = []
        text_lower = text.lower()
        
        doc_keywords = {
            'report': ['report', 'summary', 'findings', 'results'],
            'manual': ['manual', 'guide', 'instructions', 'tutorial'],
            'contract': ['contract', 'agreement', 'terms', 'conditions'],
            'invoice': ['invoice', 'bill', 'payment', 'receipt'],
            'reference': ['reference', 'documentation', 'specification']
        }
        
        for tag, keywords in doc_keywords.items():
            if any(keyword in text_lower for keyword in keywords):
                tags.append(tag)
        
        return tags
    
    def _extract_data_tags(self, text: str) -> List[str]:
        """Extract data-specific tags"""
        tags = []
        text_lower = text.lower()
        
        data_keywords = {
            'dataset': ['dataset', 'data', 'collection', 'records'],
            'analysis': ['analysis', 'analytics', 'insights', 'findings'],
            'statistics': ['statistics', 'stats', 'metrics', 'numbers'],
            'visualization': ['chart', 'graph', 'plot', 'visualization'],
            'experiment': ['experiment', 'test', 'trial', 'study'],
            'backup': ['backup', 'archive', 'export', 'dump'],
            'configuration': ['config', 'settings', 'parameters', 'setup'],
            'log': ['log', 'history', 'timeline', 'events']
        }
        
        for tag, keywords in data_keywords.items():
            if any(keyword in text_lower for keyword in keywords):
                tags.append(tag)
        
        return tags

# Global AI service instance
ai_service = AIService()

# Helper functions for use in routers
async def analyze_content(text: str, content_type: str = "general") -> Dict[str, Any]:
    """Analyze content and return smart tags and insights"""
    return await ai_service.analyze_content(text, content_type)

def is_ai_enabled() -> bool:
    """Check if AI features are enabled"""
    return ai_service.enabled
