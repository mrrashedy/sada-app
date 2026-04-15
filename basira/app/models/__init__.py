"""SQLAlchemy models. Importing this package registers all tables with Base.metadata."""
from app.models.analysis import Analysis
from app.models.digest import Digest
from app.models.document import Document, DocumentTopic
from app.models.ingest_run import IngestRun
from app.models.source import Source
from app.models.topic import Topic

__all__ = [
    "Analysis",
    "Digest",
    "Document",
    "DocumentTopic",
    "IngestRun",
    "Source",
    "Topic",
]
