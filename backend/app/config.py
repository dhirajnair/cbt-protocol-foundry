"""Configuration management for CBT Backend."""
import json
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
    )
    
    # OpenAI
    openai_api_key: str = ""
    openai_model: str = "gpt-4o"
    
    # Database (PostgreSQL)
    database_url: str = "postgresql://cbt:cbt@localhost:5432/cbt"
    
    # Server
    host: str = "0.0.0.0"
    port: int = 8000
    mcp_port: int = 8001
    
    # Safety settings
    max_iterations: int = 5
    safety_threshold: int = 80
    empathy_threshold: int = 70
    generation_timeout: int = 60
    
    # CORS - stored as string, accessed as list via property
    cors_origins_str: str = Field(
        default="http://localhost:5173,http://localhost:3000",
        alias="CORS_ORIGINS"
    )
    
    @property
    def cors_origins(self) -> list[str]:
        """Parse CORS origins from comma-separated string or JSON list."""
        v = self.cors_origins_str
        # Handle empty string
        if not v.strip():
            return ["http://localhost:5173", "http://localhost:3000"]
        # Try JSON first
        if v.strip().startswith("["):
            try:
                return json.loads(v)
            except json.JSONDecodeError:
                pass
        # Fall back to comma-separated string
        return [origin.strip() for origin in v.split(",") if origin.strip()]


settings = Settings()
