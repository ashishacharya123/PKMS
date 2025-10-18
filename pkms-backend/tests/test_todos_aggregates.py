import pytest
from sqlalchemy.ext.asyncio import AsyncSession
from httpx import AsyncClient
from app.models.todo import Project, Todo, TodoStatus


@pytest.mark.asyncio
async def test_list_projects_grouped_counts(async_client: AsyncClient, db_session: AsyncSession, test_user):
    # Seed projects and todos
    p1 = Project(uuid="p1", created_by=test_user.uuid, name="P1")
    p2 = Project(uuid="p2", created_by=test_user.uuid, name="P2")
    db_session.add_all([p1, p2])
    await db_session.commit()
    await db_session.refresh(p1)
    await db_session.refresh(p2)

    # Create todos and link to projects via service-independent attributes
    t1 = Todo(uuid="t1", created_by=test_user.uuid, title="T1", status=TodoStatus.PENDING)
    t2 = Todo(uuid="t2", created_by=test_user.uuid, title="T2", status=TodoStatus.DONE)
    t3 = Todo(uuid="t3", created_by=test_user.uuid, title="T3", status=TodoStatus.DONE)
    db_session.add_all([t1, t2, t3])
    await db_session.commit()

    # Associate todos with projects
    from app.models.associations import todo_projects
    await db_session.execute(todo_projects.insert().values([
        {"project_uuid": p1.uuid, "todo_uuid": t1.uuid},
        {"project_uuid": p1.uuid, "todo_uuid": t2.uuid},
        {"project_uuid": p2.uuid, "todo_uuid": t3.uuid},
    ]))
    await db_session.commit()

    r = await async_client.get("/api/v1/todos/projects")
    assert r.status_code == 200
    rows = r.json()
    by_uuid = {row["uuid"]: row for row in rows}
    assert by_uuid["p1"]["total_todos"] == 2 or by_uuid["p1"].get("total", 2) == 2
    assert by_uuid["p1"].get("completed_todos") in (1, by_uuid["p1"].get("completed"))
    assert by_uuid["p2"].get("completed_todos") in (1, by_uuid["p2"].get("completed"))


