"""
Project Model for Organizing Work Items

Projects can contain todos, documents, notes, and have tags for better organization.
Supports FTS5 search and project duplication functionality.
"""
from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean, ForeignKey, Date, Enum, Index
from sqlalchemy.orm import relationship
from uuid import uuid4
from datetime import datetime, date

from app.models.base import Base
from app.config import nepal_now
from app.models.enums import ProjectStatus, TodoStatus, TaskPriority
from app.models.tag_associations import project_tags
from app.models.associations import note_projects, document_projects, todo_projects


class Project(Base):
    """Project model for organizing todos, documents, and notes"""

    __tablename__ = "projects"

    # Primary identity
    uuid = Column(String(36), primary_key=True, nullable=False, default=lambda: str(uuid4()), index=True)

    # Basic info
    name = Column(String(255), nullable=False, index=True)
    description = Column(Text, nullable=True)

    # Visual customization removed - color and icon deemed unnecessary
    sort_order = Column(Integer, default=0)

    # Status and lifecycle
    status = Column(Enum(ProjectStatus), default=ProjectStatus.IS_RUNNING, nullable=False, index=True)
    priority = Column(Enum(TaskPriority), default=TaskPriority.MEDIUM, nullable=False, index=True)
    is_archived = Column(Boolean, default=False, index=True)
    is_favorite = Column(Boolean, default=False, index=True)
    is_deleted = Column(Boolean, default=False, index=True)
    progress_percentage = Column(Integer, default=0)  # Auto-calculated from todos or manual override

    # Timeline
    start_date = Column(Date, nullable=True)
    due_date = Column(Date, nullable=True)   # When project should be completed
    completion_date = Column(DateTime(timezone=True), nullable=True)  # When project was actually completed

    # Audit trail
    created_by = Column(String(36), ForeignKey("users.uuid", ondelete="CASCADE"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=nepal_now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=nepal_now(), onupdate=nepal_now(), nullable=False)
    # Search indexing - FTS5 full-text search content (name, description, tags)
    search_vector = Column(Text, nullable=True)  # Populated with searchable content for FTS5
    
    # Composite indexes for common query patterns
    __table_args__ = (
        Index('ix_project_user_deleted_created', 'created_by', 'is_deleted', 'created_at'),
        Index('ix_project_user_status', 'created_by', 'status'),
        Index('ix_project_user_favorite', 'created_by', 'is_favorite'),
    )

    # Relationships
    user = relationship("User", back_populates="projects", foreign_keys=[created_by])
    tag_objs = relationship("Tag", secondary=project_tags, back_populates="projects")

    # Many-to-many relationships (ordered via association sort_order)
    notes = relationship(
        "Note",
        secondary=note_projects,
        back_populates="projects",
        order_by=note_projects.c.sort_order
    )
    documents_multi = relationship(
        "Document",
        secondary=document_projects,
        back_populates="projects",
        order_by=document_projects.c.sort_order
    )
    todos_multi = relationship(
        "Todo",
        secondary=todo_projects,
        back_populates="projects",
        order_by=todo_projects.c.sort_order
    )

    def duplicate(self, session, name_suffix="Copy", include_associated_items=False):
        """
        Create a duplicate of this project.

        Args:
            session: SQLAlchemy session
            name_suffix: Suffix to add to project name (default: "Copy")
            include_associated_items: Whether to copy associated todos, documents, notes

        Returns:
            Project: The new duplicated project
        """
        # Create new project with copied data
        new_project = Project(
            name=f"{self.name} - {name_suffix}",
            description=self.description,
            status=self.status,
            sort_order=self.sort_order + 1,  # Place it after original
            start_date=self.start_date,
            due_date=self.due_date,  # Include due date in duplication
            created_by=self.created_by,
            # Reset completion-related fields
            progress_percentage=0,
            is_archived=False,
            is_favorite=False,
            completion_date=None  # Reset completion date
        )

        session.add(new_project)
        session.flush()  # Get the UUID for new project

        # Copy tags
        for tag in self.tag_objs:
            new_project.tag_objs.append(tag)

        # Optionally copy associated items
        if include_associated_items:
            # Copy todos (create new todos, not reference existing ones)
            for todo in self.todos_multi:
                # This would need to be implemented in todo service
                # For now, just create relationship without duplication
                new_project.todos_multi.append(todo)

            # Copy documents (reference existing documents)
            for document in self.documents_multi:
                new_project.documents_multi.append(document)

            # Copy notes (reference existing notes)
            for note in self.notes:
                new_project.notes.append(note)

        # Update search vector for new project
        new_project.update_search_vector()

        return new_project

    def update_search_vector(self):
        """
        Update the search vector for FTS5 indexing.
        Should be called whenever project data changes.
        """
        # Collect tag names
        tag_names = " ".join([tag.name for tag in self.tag_objs]) if self.tag_objs else ""

        # Build search content
        search_content = f"{self.name} {self.description or ''} {tag_names}"

        # Update search vector (simple implementation - could be enhanced with proper FTS5 functions)
        self.search_vector = search_content.strip()

    def get_project_summary(self):
        """
        Get a summary of project statistics.

        Returns:
            dict: Project summary with counts and stats
        """

        # Count associated items
        todo_count = len(self.todos_multi) if self.todos_multi else 0
        document_count = len(self.documents_multi) if self.documents_multi else 0
        note_count = len(self.notes) if self.notes else 0

        # Count completed todos
        completed_todos = 0
        if self.todos_multi:
            completed_todos = sum(1 for todo in self.todos_multi if todo.status == TodoStatus.DONE)

        # Calculate actual progress if not manually set
        if todo_count > 0:
            actual_progress = int((completed_todos / todo_count) * 100)
        else:
            actual_progress = 0

        return {
            'uuid': self.uuid,
            'name': self.name,
            'status': self.status,
            'progress_percentage': self.progress_percentage,
            'actual_progress': actual_progress,
            'todo_count': todo_count,
            'completed_todos': completed_todos,
            'document_count': document_count,
            'note_count': note_count,
            'tag_count': len(self.tag_objs) if self.tag_objs else 0,
            'start_date': self.start_date,
            'due_date': self.due_date,
            'days_remaining': (self.due_date - date.today()).days if self.due_date and self.due_date > date.today() else None
        }

    def __repr__(self):
        return f"<Project(uuid={self.uuid}, name='{self.name}', status='{self.status}')>"


class ProjectSectionOrder(Base):
    """Model for ordering sections within a project"""
    
    __tablename__ = 'project_section_order'
    
    project_uuid = Column(String(36), ForeignKey('projects.uuid', ondelete='CASCADE'), primary_key=True)
    section_type = Column(Text, primary_key=True)  # enforce values in app: 'documents','notes','todos'
    sort_order = Column(Integer, nullable=False)
    
    def __repr__(self):
        return f"<ProjectSectionOrder(project_uuid={self.project_uuid}, section_type='{self.section_type}', sort_order={self.sort_order})>"


# FTS5 trigger function (would be created in database migration)
def create_project_fts_trigger():
    """
    SQL for creating FTS5 trigger for projects.
    This should be added to database setup.
    """
    return """
    -- Create FTS5 virtual table for projects
    CREATE VIRTUAL TABLE IF NOT EXISTS projects_fts USING fts5(
        project_uuid UNINDEXED,
        name,
        description,
        tag_names,
        content='projects',
        content_rowid='rowid'
    );

    -- Trigger to update FTS index when project changes
    CREATE TRIGGER IF NOT EXISTS projects_fts_insert AFTER INSERT ON projects BEGIN
        INSERT INTO projects_fts(project_uuid, name, description, tag_names)
        VALUES (NEW.uuid, NEW.name, COALESCE(NEW.description, ''),
                (SELECT GROUP_CONCAT(t.name, ' ')
                 FROM tags t
                 JOIN project_tags pt ON t.uuid = pt.tag_uuid
                 WHERE pt.project_uuid = NEW.uuid));
    END;

    CREATE TRIGGER IF NOT EXISTS projects_fts_update AFTER UPDATE ON projects BEGIN
        UPDATE projects_fts SET
            name = NEW.name,
            description = COALESCE(NEW.description, ''),
            tag_names = (SELECT GROUP_CONCAT(t.name, ' ')
                        FROM tags t
                        JOIN project_tags pt ON t.uuid = pt.tag_uuid
                        WHERE pt.project_uuid = NEW.uuid)
        WHERE project_uuid = NEW.uuid;
    END;

    CREATE TRIGGER IF NOT EXISTS projects_fts_delete AFTER DELETE ON projects BEGIN
        DELETE FROM projects_fts WHERE project_uuid = OLD.uuid;
    END;
    """