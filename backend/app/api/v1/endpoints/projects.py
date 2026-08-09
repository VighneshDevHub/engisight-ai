import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import get_current_user, require_role
from app.db.session import get_db
from app.models.project import Project
from app.models.project_member import ProjectMember
from app.models.user import User
from app.schemas.project import ProjectCreate, ProjectRead, ProjectUpdate
from app.schemas.project_member import ProjectMemberAdd, ProjectMemberRead

router = APIRouter()


@router.get("", response_model=list[ProjectRead])
async def list_projects(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role == "admin":
        result = await db.execute(select(Project).order_by(Project.created_at.desc()))
        return result.scalars().all()

    member_subq = select(ProjectMember.project_id).where(ProjectMember.user_id == current_user.id)
    result = await db.execute(
        select(Project).where(Project.id.in_(member_subq)).order_by(Project.created_at.desc())
    )
    return result.scalars().all()


@router.post(
    "",
    response_model=ProjectRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_role("admin", "engineering_manager"))],
)
async def create_project(
    payload: ProjectCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    existing = await db.execute(select(Project).where(Project.code == payload.code))
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Project code already exists")

    project = Project(
        code=payload.code,
        name=payload.name,
        description=payload.description,
        engineering_category=payload.engineering_category,
        deadline=payload.deadline,
        status="active",
        created_by=current_user.id,
    )
    db.add(project)
    await db.commit()
    await db.refresh(project)

    db.add(
        ProjectMember(
            project_id=project.id,
            user_id=current_user.id,
            role="owner",
            added_by=current_user.id,
        )
    )
    await db.commit()
    return project


@router.get("/{project_id}", response_model=ProjectRead)
async def get_project(
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    project = await _get_project_or_404(project_id, db)
    await _require_project_access(project_id, current_user, db)
    return project


@router.patch(
    "/{project_id}",
    response_model=ProjectRead,
    dependencies=[Depends(require_role("admin", "engineering_manager"))],
)
async def update_project(
    project_id: uuid.UUID,
    payload: ProjectUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    project = await _get_project_or_404(project_id, db)
    await _require_project_access(project_id, current_user, db)

    data = payload.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(project, k, v)
    await db.commit()
    await db.refresh(project)
    return project


@router.post(
    "/{project_id}/archive",
    response_model=ProjectRead,
    dependencies=[Depends(require_role("admin", "engineering_manager"))],
)
async def archive_project(
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    project = await _get_project_or_404(project_id, db)
    await _require_project_access(project_id, current_user, db)
    project.status = "archived"
    await db.commit()
    await db.refresh(project)
    return project


@router.get("/{project_id}/members", response_model=list[ProjectMemberRead])
async def list_members(
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _require_project_access(project_id, current_user, db)
    result = await db.execute(
        select(ProjectMember).where(ProjectMember.project_id == project_id).order_by(ProjectMember.added_at.desc())
    )
    return result.scalars().all()


@router.post(
    "/{project_id}/members",
    response_model=ProjectMemberRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_role("admin", "engineering_manager"))],
)
async def add_member(
    project_id: uuid.UUID,
    payload: ProjectMemberAdd,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _require_project_access(project_id, current_user, db)
    await _get_project_or_404(project_id, db)

    existing = await db.execute(
        select(ProjectMember).where(
            ProjectMember.project_id == project_id, ProjectMember.user_id == payload.user_id
        )
    )
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="User already a member")

    db.add(
        ProjectMember(
            project_id=project_id,
            user_id=payload.user_id,
            role=payload.role,
            added_by=current_user.id,
        )
    )
    await db.commit()

    result = await db.execute(
        select(ProjectMember).where(
            ProjectMember.project_id == project_id, ProjectMember.user_id == payload.user_id
        )
    )
    return result.scalar_one()


@router.delete(
    "/{project_id}/members/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_role("admin", "engineering_manager"))],
)
async def remove_member(
    project_id: uuid.UUID,
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _require_project_access(project_id, current_user, db)
    if user_id == current_user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot remove self")
    await db.execute(
        delete(ProjectMember).where(ProjectMember.project_id == project_id, ProjectMember.user_id == user_id)
    )
    await db.commit()


async def _get_project_or_404(project_id: uuid.UUID, db: AsyncSession) -> Project:
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return project


async def _require_project_access(project_id: uuid.UUID, user: User, db: AsyncSession) -> None:
    if user.role == "admin":
        return
    result = await db.execute(
        select(ProjectMember).where(
            ProjectMember.project_id == project_id, ProjectMember.user_id == user.id
        )
    )
    if result.scalar_one_or_none() is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a project member")

