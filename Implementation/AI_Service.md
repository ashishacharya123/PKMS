# AI Service Implementation Guide

## 🧠 Overview
The AI Service provides intelligent content analysis and tagging for PKMS using lightweight transformer models that work efficiently on CPU without requiring GPU resources.

## 🎯 Current Implementation Status: ✅ COMPLETED

### Features Active
- **Smart Content Tagging**: Automatic tag generation based on text analysis
- **Sentiment Analysis**: Mood detection for diary entries
- **Content Categorization**: Automatic classification (work, personal, education, etc.)
- **Text Summarization**: Brief summaries for long content
- **Semantic Similarity**: Find related content across modules
- **Module-Specific Tagging**: Specialized tags for different content types

## 🔧 Technical Architecture

### Models Used (CPU-Only)
```python
# Zero-shot classification
classifier_model = "facebook/bart-large-mnli"

# Sentiment analysis
sentiment_model = "cardiffnlp/twitter-roberta-base-sentiment-latest"

# Text summarization
summarization_model = "facebook/bart-large-cnn"

# Semantic similarity
similarity_model = "all-MiniLM-L6-v2"
```

### Service Location
- **Main Service**: `pkms-backend/app/services/ai_service.py`
- **Initialization**: Lazy loading of models (only when needed)
- **Fallback**: Keyword-based analysis when models unavailable

## 📊 Performance Characteristics

### Docker Image Impact
- **Base PKMS**: 525MB
- **With AI Features**: ~1.2GB (+700MB)
- **Model Downloads**: Automatic on first use
- **Memory Usage**: ~2-4GB RAM for all models loaded

### Speed Benchmarks
- **Tag Generation**: 1-3 seconds for typical content
- **Sentiment Analysis**: <1 second
- **Text Summarization**: 2-5 seconds depending on length
- **Semantic Similarity**: <1 second per comparison

## 🏷️ Module-Specific Tagging

### Notes Module
**Categories**: research, ideas, meeting-notes, planning, brainstorming
**Topics**: project-specific, academic, personal, work-related
**Content**: technical, creative, analytical, reference

### Documents Module  
**Types**: reports, contracts, invoices, presentations, manuals
**Categories**: legal, financial, technical, marketing, hr
**Status**: draft, final, archived, confidential

### Diary Module
**Emotions**: grateful, excited, stressed, calm, motivated
**Activities**: workout, travel, work, family, hobbies
**Mood**: positive, negative, neutral (with confidence scores)
**Topics**: health, relationships, goals, challenges

### Archive Module (New)
**Data Types**: datasets, configs, backups, exports, logs
**Formats**: csv, json, xml, sql, code, documentation
**Purpose**: analysis, configuration, storage, reference
**Project**: by detected project names or contexts

## 🔄 API Integration

### Usage in Routers
```python
from app.services.ai_service import analyze_content

# Example usage in notes router
async def create_note(note_data: NoteCreate, ...):
    # Create note
    note = Note(...)
    
    # AI analysis
    analysis = await analyze_content(
        text=note.content, 
        content_type="note"
    )
    
    # Apply smart tags
    if analysis.get("tags"):
        await _handle_note_tags(db, note, analysis["tags"], user.id)
```

### Response Format
```python
{
    "tags": ["research", "ai", "machine-learning"],
    "category": "technical",
    "sentiment": {
        "label": "positive",
        "confidence": 0.85
    },
    "summary": "Brief summary of content...",
    "topics": ["artificial intelligence", "research methods"],
    "confidence": 0.92
}
```

## 🚀 Optional Q&A Enhancement (Not Implemented)

### Future Addition: Question Answering
For advanced Q&A capabilities, the following can be added:

#### Installation
```bash
# Add to requirements.txt
torch==2.1.0  # ~800MB

# Install manually if needed
pip install torch transformers[torch]
```

#### Model Addition
```python
# In ai_service.py
from transformers import AutoTokenizer, AutoModelForSeq2SeqLM

class AIService:
    def __init__(self):
        # ... existing models ...
        self.qa_model_name = "google/flan-t5-small"  # ~300MB
        self.qa_model = None
        self.qa_tokenizer = None
    
    async def answer_question(self, question: str, context: str) -> str:
        """Answer questions based on provided context"""
        if not self.qa_model:
            await self._load_qa_model()
        
        prompt = f"Context: {context}\nQuestion: {question}\nAnswer:"
        inputs = self.qa_tokenizer(prompt, return_tensors="pt", truncation=True)
        outputs = self.qa_model.generate(**inputs, max_length=150)
        return self.qa_tokenizer.decode(outputs[0], skip_special_tokens=True)
```

#### API Endpoints
```python
# New endpoints to add
@router.post("/archive/ask")
async def ask_question_about_archive(
    question: str,
    folder_uuid: Optional[str] = None
):
    """Ask questions about archive content"""
    pass

@router.post("/global/ask")  
async def ask_question_global(question: str):
    """Ask questions across all modules"""
    pass
```

## ⚠️ Important Notes

### Graceful Degradation
The AI service includes fallback mechanisms:
- **Model Loading Failure**: Falls back to keyword-based tagging
- **Network Issues**: Uses cached analysis or simple heuristics
- **Memory Constraints**: Loads models individually as needed

### Error Handling
```python
try:
    analysis = await ai_service.analyze_content(text, "note")
except Exception as e:
    logger.warning(f"AI analysis failed: {e}")
    # Continue without AI features
    analysis = {"tags": [], "category": "general"}
```

### Configuration
The AI service respects system settings:
- **Disable AI**: Set environment variable `DISABLE_AI=true`
- **Model Cache**: Models cached in `~/.cache/huggingface/`
- **Timeout**: 30-second timeout for model operations

## 📈 Monitoring and Metrics

### Performance Monitoring
- **Response Times**: Track analysis duration
- **Memory Usage**: Monitor model memory consumption  
- **Error Rates**: Track failures and fallbacks
- **Cache Hit Rates**: Monitor model loading frequency

### Usage Analytics
- **Tag Accuracy**: User feedback on generated tags
- **Feature Usage**: Which AI features are used most
- **Performance Impact**: Effect on overall system performance

## 🔧 Maintenance

### Model Updates
Models are automatically downloaded and cached. To update:
1. Clear HuggingFace cache: `rm -rf ~/.cache/huggingface/`
2. Restart application to download latest models
3. Monitor for improved performance/accuracy

### Troubleshooting
Common issues and solutions:
- **High Memory Usage**: Reduce concurrent AI operations
- **Slow Performance**: Check CPU resources, consider model size reduction
- **Network Errors**: Ensure internet access for initial model downloads
- **Dependency Conflicts**: Use virtual environment with pinned versions

## 📋 Future Enhancements

### Planned Improvements
- **Custom Model Training**: Train on user-specific content
- **Multi-language Support**: Add non-English content analysis
- **Real-time Analysis**: Stream analysis results
- **Batch Processing**: Analyze multiple items efficiently

### Integration Opportunities  
- **Search Enhancement**: Use embeddings for semantic search
- **Content Recommendations**: Suggest related items
- **Auto-Organization**: Automatically organize content
- **Insight Generation**: Provide analytics on knowledge patterns 