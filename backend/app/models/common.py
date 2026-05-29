from pydantic import BaseModel
from typing import Any


class QueryInfo(BaseModel):
    mongodb_pipeline: list[dict[str, Any]] | None = None
    mongodb_filter: dict[str, Any] | None = None
    sql_equivalent: str
    index_hint: str | None = None


class PaginatedResponse(BaseModel):
    data: list[Any]
    total: int
    query_info: QueryInfo
