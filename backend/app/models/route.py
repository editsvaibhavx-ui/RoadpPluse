from sqlalchemy import Column, Integer, String, Boolean, Text, DateTime
from datetime import datetime
from app.database import Base

class Route(Base):
    __tablename__ = "routes"

    id = Column(Integer, primary_key=True, index=True)
    route_code = Column(String(50), unique=True, index=True, nullable=False)
    route_name = Column(String(150), nullable=False)
    start_point = Column(String(100), nullable=False)
    end_point = Column(String(100), nullable=False)
    waypoints_json = Column(Text, nullable=True)  # JSON-encoded array of lat/lng/name stops
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
