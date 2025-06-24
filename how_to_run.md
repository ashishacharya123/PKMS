# 🐳 How to Run the PKMS Application

## 🚀 Running the Backend with Docker
1. **Ensure Docker is installed and running** on your machine.
2. **Navigate to the project root directory** where `docker-compose.yml` is located.
   ```bash
   cd /path/to/your/PKMS
   ```
3. **Start the backend service** using Docker Compose:
   ```bash
   docker-compose up -d
   ```
   This command will build the backend image and start the FastAPI server.

## 🌐 Running the Frontend Locally
1. **Navigate to the frontend directory**:
   ```bash
   cd pkms-frontend
   ```
2. **Install the necessary dependencies** (if not already done):
   ```bash
   npm install --legacy-peer-deps
   ```
3. **Start the frontend development server**:
   ```bash
   npm run dev
   ```
   This will start the React application with Vite, accessible at `http://localhost:3000`.

## ✅ Accessing the Application
- **Backend API**: Access the FastAPI backend at `http://localhost:8000`
- **Frontend**: Access the React frontend at `http://localhost:3000`
- **API Documentation**: Interactive docs at `http://localhost:8000/docs`

## 🛑 Stopping the Services
- To stop the backend service, run:
  ```bash
  docker-compose down
  ```
- To stop the frontend, simply terminate the terminal running the `npm run dev` command.

## 🔧 Useful Commands
- **View backend logs**: `docker-compose logs -f pkms-backend`
- **Restart services**: `docker-compose restart`
- **Rebuild after changes**: `docker-compose up -d --build`
- **Check container status**: `docker-compose ps`

## 🔒 Security Notes
- All dependencies have been updated to latest secure versions
- High-severity vulnerabilities in `react-pdf` have been resolved
- Deprecated packages have been removed
- Production dependencies are vulnerability-free 