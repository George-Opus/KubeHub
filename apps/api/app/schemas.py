from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class UserCreate(BaseModel):
    email: EmailStr
    username: str = Field(min_length=3, max_length=100)
    password: str = Field(min_length=8, max_length=128)


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: EmailStr
    username: str
    created_at: datetime


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class RegistrationStatus(BaseModel):
    enabled: bool
    bootstrap: bool


class ClusterCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    kubeconfig: str = Field(min_length=1)
    context: str | None = None
    description: str | None = None
    color: str = "emerald"


class ClusterUpdate(BaseModel):
    name: str | None = None
    kubeconfig: str | None = None
    context: str | None = None
    description: str | None = None
    color: str | None = None


class ClusterOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    description: str | None
    context: str | None
    color: str
    status: str
    last_error: str | None
    server_url: str | None
    last_checked_at: datetime | None
    created_at: datetime
    updated_at: datetime
