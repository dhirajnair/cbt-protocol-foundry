"""Main FastAPI application for CBT Protocol Foundry."""
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.db import init_db, init_checkpointer, close_checkpointer
from app.api import router


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler."""
    # Startup
    print("🚀 Starting CBT Backend...")
    init_db()
    await init_checkpointer()
    print("✅ All systems ready")
    
    yield
    
    # Shutdown
    print("🛑 Shutting down...")
    await close_checkpointer()
    print("✅ Shutdown complete")


app = FastAPI(
    title="CBT - CBT Protocol Foundry",
    description="Multi-agent system for generating safe, empathetic CBT protocols",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routes
app.include_router(router)


@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "name": "CBT - CBT Protocol Foundry",
        "version": "0.1.0",
        "status": "running",
        "docs": "/docs",
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        reload=True,
    )
