#!/bin/bash

echo "========================================"
echo "PKMS Database Restore Script"
echo "========================================"
echo

# Check if Docker is available
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed or not in PATH"
    echo "Please install Docker and try again"
    exit 1
fi

# Check if docker-compose is available
if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose is not available"
    echo "Please ensure Docker Compose is installed"
    exit 1
fi

# Check if we're in the right directory
if [ ! -f "../../docker-compose.yml" ]; then
    echo "❌ docker-compose.yml not found"
    echo "Please run this script from PKMS_Data/backups/ folder"
    echo "Expected location: PKMS/PKMS_Data/backups/"
    exit 1
fi

# Function to list available backups
list_backups() {
    echo "📋 Available backup files:"
    echo
    
    backup_count=0
    backup_files=()
    
    if ls *.db 1> /dev/null 2>&1; then
        for file in *.db; do
            backup_count=$((backup_count + 1))
            backup_files+=("$file")
            
            # Get file size and date
            file_size=$(stat -f%z "$file" 2>/dev/null || stat -c%s "$file" 2>/dev/null)
            file_date=$(stat -f%Sm -t "%Y-%m-%d %H:%M:%S" "$file" 2>/dev/null || stat -c%y "$file" 2>/dev/null)
            
            # Calculate size in MB
            size_mb=$((file_size / 1024 / 1024))
            
            echo "[$backup_count] $file"
            echo "   Size: ${size_mb} MB"
            echo "   Date: $file_date"
            echo
        done
    else
        echo "❌ No backup files found in current directory"
        echo
        echo "Please ensure backup files (.db) are in this folder:"
        echo "$(pwd)"
        exit 1
    fi
    
    if [ $backup_count -eq 0 ]; then
        echo "❌ No valid backup files found"
        exit 1
    fi
}

# Function to get user selection
get_selection() {
    echo "========================================"
    echo "Select backup file to restore:"
    echo "========================================"
    echo
    
    read -p "Enter backup number (1-$backup_count) or 'q' to quit: " selection
    
    if [ "$selection" = "q" ] || [ "$selection" = "Q" ]; then
        echo "Restore cancelled."
        exit 0
    fi
    
    # Validate selection
    if [ -z "$selection" ]; then
        echo "❌ Invalid selection. Please try again."
        echo
        return 1
    fi
    
    # Check if selection is a number
    if ! [[ "$selection" =~ ^[0-9]+$ ]]; then
        echo "❌ Invalid selection. Please enter a number."
        echo
        return 1
    fi
    
    # Check if selection is in valid range
    if [ "$selection" -lt 1 ] || [ "$selection" -gt "$backup_count" ]; then
        echo "❌ Invalid selection. Please enter a number between 1 and $backup_count."
        echo
        return 1
    fi
    
    return 0
}

# Main script logic
list_backups

# Get user selection with validation
while ! get_selection; do
    list_backups
done

# Get selected backup file
selected_backup="${backup_files[$((selection - 1))]}"

echo
echo "✅ Selected backup: $selected_backup"
echo

# Get file details
file_size=$(stat -f%z "$selected_backup" 2>/dev/null || stat -c%s "$selected_backup" 2>/dev/null)
file_date=$(stat -f%Sm -t "%Y-%m-%d %H:%M:%S" "$selected_backup" 2>/dev/null || stat -c%y "$selected_backup" 2>/dev/null)
size_mb=$((file_size / 1024 / 1024))

echo "📊 Backup Details:"
echo "   File: $selected_backup"
echo "   Size: ${size_mb} MB"
echo "   Date: $file_date"
echo

# Confirm restore
echo "⚠️  WARNING: This will replace the current database with the backup!"
echo "   All current data will be LOST and replaced with backup data."
echo
read -p "Are you sure you want to continue? (y/N): " confirm

if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
    echo "Restore cancelled."
    exit 0
fi

echo
echo "🔄 Starting restore process..."
echo

# Stop Docker services
echo "[1/4] Stopping Docker services..."
docker-compose down
if [ $? -ne 0 ]; then
    echo "❌ Failed to stop Docker services"
    echo "Error code: $?"
    exit 1
fi
echo "✅ Docker services stopped"

# Wait a moment for services to fully stop
sleep 3

# Restore database from backup
echo
echo "[2/4] Restoring database from backup..."
echo "   Source: $selected_backup"
echo "   Target: /app/data/pkm_metadata.db"

docker-compose cp "$selected_backup" pkms-backend:/app/data/pkm_metadata.db
if [ $? -ne 0 ]; then
    echo "❌ Failed to restore database from backup"
    echo "Error code: $?"
    echo
    echo "Trying to start Docker services anyway..."
    docker-compose up -d
    exit 1
fi
echo "✅ Database restored successfully"

# Wait a moment for file to be written
sleep 2

# Start Docker services
echo
echo "[3/4] Starting Docker services..."
docker-compose up -d
if [ $? -ne 0 ]; then
    echo "❌ Failed to start Docker services"
    echo "Error code: $?"
    echo
    echo "Database was restored but services failed to start."
    echo "Please check Docker logs: docker-compose logs"
    exit 1
fi
echo "✅ Docker services started"

# Wait for services to be ready
echo
echo "[4/4] Waiting for services to be ready..."
echo "   This may take 30-60 seconds..."
sleep 30

# Check if services are running
echo
echo "🔍 Checking service status..."
docker-compose ps
if [ $? -ne 0 ]; then
    echo "⚠️  Warning: Could not check service status"
    echo "Please check manually: docker-compose ps"
fi

echo
echo "========================================"
echo "✅ RESTORE COMPLETED SUCCESSFULLY!"
echo "========================================"
echo
echo "📋 Summary:"
echo "   Backup file: $selected_backup"
echo "   File size: ${size_mb} MB"
echo "   Restore time: $(date)"
echo
echo "🌐 Next steps:"
echo "   1. Open browser to http://localhost:3000"
echo "   2. Login with your existing credentials"
echo "   3. Verify your data is restored correctly"
echo "   4. Test diary unlock (if applicable)"
echo
echo "⚠️  Important notes:"
echo "   - All active sessions may need to be refreshed"
echo "   - If you cannot login, try a different backup file"
echo "   - Check the troubleshooting guide if you have issues"
echo
echo "📚 For help, see: TROUBLESHOOTING.md"
echo

# Ask if user wants to open browser
read -p "Open PKMS in browser now? (y/N): " open_browser
if [ "$open_browser" = "y" ] || [ "$open_browser" = "Y" ]; then
    if command -v open &> /dev/null; then
        open http://localhost:3000
    elif command -v xdg-open &> /dev/null; then
        xdg-open http://localhost:3000
    else
        echo "Please open http://localhost:3000 in your browser"
    fi
fi

echo
echo "Restore completed at $(date)"
echo "========================================"
