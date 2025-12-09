"""Configuration management for Cerina Backend."""
import os
from pathlib import Path
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    
    # OpenAI
    openai_api_key: str = ""
    openai_model: str = "gpt-4o"
    
    # Database (PostgreSQL)
    database_url: str = "postgresql://cerina:cerina@localhost:5432/cerina"
    
    # Server
    host: str = "0.0.0.0"
    port: int = 8000
    mcp_port: int = 8001
    
    # Safety settings
    max_iterations: int = 5
    safety_threshold: int = 80
    empathy_threshold: int = 70
    generation_timeout: int = 60
    
    # CORS
    cors_origins: list[str] = ["http://localhost:5173", "http://localhost:3000"]
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
