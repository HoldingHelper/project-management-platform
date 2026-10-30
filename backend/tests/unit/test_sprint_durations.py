from datetime import date, timedelta
from uuid import uuid4
import pytest
from pydantic import ValidationError
from app.modules.projects.schemas import ProjectSprintCreate, PhaseCreate, PhaseUpdate, SprintBatchCreate

@pytest.mark.parametrize("duration", [3, 7, 14])
def test_sprint_end_is_derived(duration):
    sprint = ProjectSprintCreate(name="Sprint", start_date=date(2028, 2, 28), duration_days=duration)
    assert sprint.end_date == sprint.start_date + timedelta(days=duration - 1)
    assert sprint.duration_days == duration

@pytest.mark.parametrize("duration", [0, 1, 4, 8, 15])
def test_unsupported_durations_are_rejected(duration):
    for schema, extra in [(ProjectSprintCreate, {"name":"Sprint", "start_date":date.today()}), (PhaseCreate, {"project_id":uuid4(), "name":"Sprint"}), (PhaseUpdate, {}), (SprintBatchCreate, {"start_date":date.today()})]:
        with pytest.raises(ValidationError):
            schema(duration_days=duration, **extra)

def test_manually_changed_end_is_rejected():
    with pytest.raises(ValidationError, match="calculated"):
        ProjectSprintCreate(name="Sprint", start_date=date(2026, 10, 30), duration_days=7, end_date=date(2026, 11, 20))

@pytest.mark.parametrize("count", [0, 53])
def test_batch_count_is_bounded(count):
    with pytest.raises(ValidationError):
        SprintBatchCreate(start_date=date.today(), count=count)
