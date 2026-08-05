"""refactor wave 1: username/profile/invitations, standalone tasks,
milestones, project dependencies, task status transitions, blocker reasons,
actionable notifications, chat schema

Revision ID: b7d2f4a9c1e3
Revises: 6661588637cc
Create Date: 2026-07-05

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'b7d2f4a9c1e3'
down_revision: Union[str, None] = '6661588637cc'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- identity ---------------------------------------------------------
    op.add_column(
        'users', sa.Column('username', sa.String(length=64), nullable=True),
        schema='identity',
    )
    op.add_column(
        'users', sa.Column('bio', sa.String(length=2000), nullable=True),
        schema='identity',
    )
    op.add_column(
        'users', sa.Column('phone', sa.String(length=32), nullable=True),
        schema='identity',
    )
    op.add_column(
        'users', sa.Column('location', sa.String(length=128), nullable=True),
        schema='identity',
    )
    op.add_column(
        'users',
        sa.Column('presence_status', sa.String(length=16), nullable=True),
        schema='identity',
    )
    op.create_unique_constraint(
        'uq_users_username', 'users', ['username'], schema='identity'
    )

    op.create_table(
        'invitations',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('email', sa.String(length=320), nullable=False),
        sa.Column('role_id', sa.UUID(), nullable=False),
        sa.Column('invited_by_user_id', sa.UUID(), nullable=False),
        sa.Column('token_hash', sa.String(length=128), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('accepted_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('revoked_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            'created_at', sa.DateTime(timezone=True),
            server_default=sa.text('now()'), nullable=False,
        ),
        sa.Column(
            'updated_at', sa.DateTime(timezone=True),
            server_default=sa.text('now()'), nullable=False,
        ),
        sa.ForeignKeyConstraint(['role_id'], ['identity.roles.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        schema='identity',
    )
    op.create_index(
        op.f('ix_identity_invitations_email'), 'invitations', ['email'],
        unique=False, schema='identity',
    )
    op.create_index(
        op.f('ix_identity_invitations_token_hash'), 'invitations',
        ['token_hash'], unique=False, schema='identity',
    )

    op.create_table(
        'user_settings',
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column(
            'notification_prefs',
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column('theme', sa.String(length=16), nullable=True),
        sa.Column('github_username', sa.String(length=64), nullable=True),
        sa.Column(
            'created_at', sa.DateTime(timezone=True),
            server_default=sa.text('now()'), nullable=False,
        ),
        sa.Column(
            'updated_at', sa.DateTime(timezone=True),
            server_default=sa.text('now()'), nullable=False,
        ),
        sa.ForeignKeyConstraint(['user_id'], ['identity.users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('user_id'),
        schema='identity',
    )

    # --- projects ---------------------------------------------------------
    op.alter_column(
        'tasks', 'phase_id', existing_type=sa.UUID(), nullable=True,
        schema='projects',
    )
    op.add_column(
        'tasks', sa.Column('github_url', sa.String(length=512), nullable=True),
        schema='projects',
    )
    op.add_column(
        'tasks', sa.Column('partition', sa.String(length=32), nullable=True),
        schema='projects',
    )
    op.add_column(
        'tasks', sa.Column('start_date', sa.Date(), nullable=True),
        schema='projects',
    )
    op.create_unique_constraint(
        'uq_tasks_github_url', 'tasks', ['github_url'], schema='projects'
    )

    op.create_table(
        'milestones',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('project_id', sa.UUID(), nullable=False),
        sa.Column('name', sa.String(length=200), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('due_date', sa.Date(), nullable=True),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('sequence', sa.Integer(), nullable=False),
        sa.Column('created_by_user_id', sa.UUID(), nullable=False),
        sa.Column(
            'created_at', sa.DateTime(timezone=True),
            server_default=sa.text('now()'), nullable=False,
        ),
        sa.Column(
            'updated_at', sa.DateTime(timezone=True),
            server_default=sa.text('now()'), nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ['project_id'], ['projects.projects.id'], ondelete='CASCADE'
        ),
        sa.PrimaryKeyConstraint('id'),
        schema='projects',
    )
    op.create_index(
        op.f('ix_projects_milestones_project_id'), 'milestones',
        ['project_id'], unique=False, schema='projects',
    )

    op.create_table(
        'project_dependencies',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('predecessor_project_id', sa.UUID(), nullable=False),
        sa.Column('successor_project_id', sa.UUID(), nullable=False),
        sa.Column('dependency_type', sa.String(length=30), nullable=False),
        sa.Column('lag_days', sa.Integer(), nullable=False),
        sa.Column(
            'created_at', sa.DateTime(timezone=True),
            server_default=sa.text('now()'), nullable=False,
        ),
        sa.Column(
            'updated_at', sa.DateTime(timezone=True),
            server_default=sa.text('now()'), nullable=False,
        ),
        sa.CheckConstraint(
            "dependency_type IN ('FinishToStart', 'StartToStart', "
            "'FinishToFinish', 'StartToFinish')",
            name='ck_dependency_type',
        ),
        sa.ForeignKeyConstraint(
            ['predecessor_project_id'], ['projects.projects.id'],
            ondelete='CASCADE',
        ),
        sa.ForeignKeyConstraint(
            ['successor_project_id'], ['projects.projects.id'],
            ondelete='CASCADE',
        ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint(
            'predecessor_project_id', 'successor_project_id',
            name='uq_project_dependency_pair',
        ),
        schema='projects',
    )
    op.create_index(
        op.f('ix_projects_project_dependencies_predecessor_project_id'),
        'project_dependencies', ['predecessor_project_id'], unique=False,
        schema='projects',
    )
    op.create_index(
        op.f('ix_projects_project_dependencies_successor_project_id'),
        'project_dependencies', ['successor_project_id'], unique=False,
        schema='projects',
    )

    op.create_table(
        'task_status_transitions',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('task_id', sa.UUID(), nullable=False),
        sa.Column('from_status', sa.String(length=20), nullable=True),
        sa.Column('to_status', sa.String(length=20), nullable=False),
        sa.Column('changed_by_user_id', sa.UUID(), nullable=True),
        sa.Column('changed_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ['task_id'], ['projects.tasks.id'], ondelete='CASCADE'
        ),
        sa.PrimaryKeyConstraint('id'),
        schema='projects',
    )
    op.create_index(
        op.f('ix_projects_task_status_transitions_task_id'),
        'task_status_transitions', ['task_id'], unique=False,
        schema='projects',
    )
    op.create_index(
        op.f('ix_projects_task_status_transitions_changed_at'),
        'task_status_transitions', ['changed_at'], unique=False,
        schema='projects',
    )

    # --- blockers ---------------------------------------------------------
    op.add_column(
        'blockers',
        sa.Column('block_reason', sa.String(length=32), nullable=True),
        schema='blockers',
    )
    op.add_column(
        'blockers',
        sa.Column('estimated_unblock_date', sa.Date(), nullable=True),
        schema='blockers',
    )
    op.create_check_constraint(
        'ck_blocker_block_reason',
        'blockers',
        "block_reason IS NULL OR block_reason IN "
        "('waiting_on_person', 'technical', 'business', 'external')",
        schema='blockers',
    )

    # --- collaboration ----------------------------------------------------
    op.add_column(
        'notifications',
        sa.Column('entity_type', sa.String(length=50), nullable=True),
        schema='collaboration',
    )
    op.add_column(
        'notifications', sa.Column('entity_id', sa.UUID(), nullable=True),
        schema='collaboration',
    )
    op.add_column(
        'notifications',
        sa.Column(
            'requires_action', sa.Boolean(),
            server_default=sa.text('false'), nullable=False,
        ),
        schema='collaboration',
    )
    op.add_column(
        'notifications',
        sa.Column('resolved_at', sa.DateTime(timezone=True), nullable=True),
        schema='collaboration',
    )

    # --- chat (schema created by alembic/env.py) ---------------------------
    op.create_table(
        'channels',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('type', sa.String(length=16), nullable=False),
        sa.Column('project_id', sa.UUID(), nullable=True),
        sa.Column('name', sa.String(length=200), nullable=False),
        sa.Column('created_by_user_id', sa.UUID(), nullable=True),
        sa.Column('archived_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            'created_at', sa.DateTime(timezone=True),
            server_default=sa.text('now()'), nullable=False,
        ),
        sa.Column(
            'updated_at', sa.DateTime(timezone=True),
            server_default=sa.text('now()'), nullable=False,
        ),
        sa.CheckConstraint("type IN ('project', 'dm')", name='ck_channel_type'),
        sa.PrimaryKeyConstraint('id'),
        schema='chat',
    )
    op.create_index(
        op.f('ix_chat_channels_project_id'), 'channels', ['project_id'],
        unique=False, schema='chat',
    )

    op.create_table(
        'channel_members',
        sa.Column('channel_id', sa.UUID(), nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('last_read_message_id', sa.UUID(), nullable=True),
        sa.Column('muted', sa.Boolean(), nullable=False),
        sa.Column(
            'created_at', sa.DateTime(timezone=True),
            server_default=sa.text('now()'), nullable=False,
        ),
        sa.Column(
            'updated_at', sa.DateTime(timezone=True),
            server_default=sa.text('now()'), nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ['channel_id'], ['chat.channels.id'], ondelete='CASCADE'
        ),
        sa.PrimaryKeyConstraint('channel_id', 'user_id'),
        schema='chat',
    )
    op.create_index(
        op.f('ix_chat_channel_members_user_id'), 'channel_members',
        ['user_id'], unique=False, schema='chat',
    )

    op.create_table(
        'messages',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('channel_id', sa.UUID(), nullable=False),
        sa.Column('sender_user_id', sa.UUID(), nullable=False),
        sa.Column('parent_message_id', sa.UUID(), nullable=True),
        sa.Column('body', sa.Text(), nullable=False),
        sa.Column('message_type', sa.String(length=16), nullable=False),
        sa.Column('attachment_id', sa.UUID(), nullable=True),
        sa.Column('mentioned_user_ids', sa.ARRAY(sa.UUID()), nullable=False),
        sa.Column('edited_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            'created_at', sa.DateTime(timezone=True),
            server_default=sa.text('now()'), nullable=False,
        ),
        sa.Column(
            'updated_at', sa.DateTime(timezone=True),
            server_default=sa.text('now()'), nullable=False,
        ),
        sa.CheckConstraint(
            "message_type IN ('text', 'voice', 'file')", name='ck_message_type'
        ),
        sa.ForeignKeyConstraint(
            ['channel_id'], ['chat.channels.id'], ondelete='CASCADE'
        ),
        sa.ForeignKeyConstraint(
            ['parent_message_id'], ['chat.messages.id'], ondelete='CASCADE'
        ),
        sa.PrimaryKeyConstraint('id'),
        schema='chat',
    )
    op.create_index(
        op.f('ix_chat_messages_channel_id'), 'messages', ['channel_id'],
        unique=False, schema='chat',
    )
    op.create_index(
        op.f('ix_chat_messages_parent_message_id'), 'messages',
        ['parent_message_id'], unique=False, schema='chat',
    )

    op.create_table(
        'message_reactions',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('message_id', sa.UUID(), nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('emoji', sa.String(length=10), nullable=False),
        sa.ForeignKeyConstraint(
            ['message_id'], ['chat.messages.id'], ondelete='CASCADE'
        ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint(
            'message_id', 'user_id', 'emoji', name='uq_message_reaction'
        ),
        schema='chat',
    )
    op.create_index(
        op.f('ix_chat_message_reactions_message_id'), 'message_reactions',
        ['message_id'], unique=False, schema='chat',
    )


def downgrade() -> None:
    op.drop_table('message_reactions', schema='chat')
    op.drop_table('messages', schema='chat')
    op.drop_table('channel_members', schema='chat')
    op.drop_table('channels', schema='chat')

    op.drop_column('notifications', 'resolved_at', schema='collaboration')
    op.drop_column('notifications', 'requires_action', schema='collaboration')
    op.drop_column('notifications', 'entity_id', schema='collaboration')
    op.drop_column('notifications', 'entity_type', schema='collaboration')

    op.drop_constraint(
        'ck_blocker_block_reason', 'blockers', schema='blockers', type_='check'
    )
    op.drop_column('blockers', 'estimated_unblock_date', schema='blockers')
    op.drop_column('blockers', 'block_reason', schema='blockers')

    op.drop_table('task_status_transitions', schema='projects')
    op.drop_table('project_dependencies', schema='projects')
    op.drop_table('milestones', schema='projects')
    op.drop_constraint(
        'uq_tasks_github_url', 'tasks', schema='projects', type_='unique'
    )
    op.drop_column('tasks', 'start_date', schema='projects')
    op.drop_column('tasks', 'partition', schema='projects')
    op.drop_column('tasks', 'github_url', schema='projects')
    op.alter_column(
        'tasks', 'phase_id', existing_type=sa.UUID(), nullable=False,
        schema='projects',
    )

    op.drop_table('user_settings', schema='identity')
    op.drop_table('invitations', schema='identity')
    op.drop_constraint(
        'uq_users_username', 'users', schema='identity', type_='unique'
    )
    op.drop_column('users', 'presence_status', schema='identity')
    op.drop_column('users', 'location', schema='identity')
    op.drop_column('users', 'phone', schema='identity')
    op.drop_column('users', 'bio', schema='identity')
    op.drop_column('users', 'username', schema='identity')
