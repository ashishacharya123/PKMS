import pytest


def test_removed_columns_not_present_models():
    # Ensure removed legacy columns/attributes aren't present
    import app.models.document as mdoc
    import app.models.diary as mdiag
    assert not hasattr(mdoc, "archive_item_uuid"), "archive_item_uuid should not exist on document model"
    # DiaryMedia should use diary_entry_uuid
    assert hasattr(mdiag, "DiaryMedia")
    assert hasattr(mdiag.DiaryMedia, "diary_entry_uuid")
    assert not hasattr(mdiag.DiaryMedia, "entry_uuid"), "entry_uuid should be removed"


def test_no_todo_is_completed_usage():
    # Ensure codebase no longer uses is_completed on Todos
    import inspect
    import app.models.todo as mtodo
    src = inspect.getsource(mtodo)
    assert "is_completed" not in src


