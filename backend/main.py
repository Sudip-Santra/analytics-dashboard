import os
import uvicorn
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

if __name__ == "__main__":
    uvicorn.run("app:app", host=os.environ["HOST"], port=int(os.environ["PORT"]), reload=True)
