// PKMS Folder Count Debugging Script
// Run this in browser console (F12) while logged into PKMS

console.log("🔍 Starting comprehensive folder count investigation...");

async function debugFolderDiscrepancy() {
  try {
    // Get auth token
    const authData = localStorage.getItem('pkms-auth');
    if (!authData) {
      console.error("❌ No auth data found");
      return;
    }
    
    const { token } = JSON.parse(authData);
    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
    
    console.log("🔑 Making parallel API calls...");
    
    // Make both API calls simultaneously
    const [dashResponse, foldersResponse] = await Promise.all([
      fetch('/api/v1/dashboard/stats', { headers }),
      fetch('/api/v1/archive/folders?archived=false', { headers })
    ]);
    
    if (!dashResponse.ok) {
      console.error("❌ Dashboard API failed:", dashResponse.status, dashResponse.statusText);
      return;
    }
    
    if (!foldersResponse.ok) {
      console.error("❌ Folders API failed:", foldersResponse.status, foldersResponse.statusText);
      return;
    }
    
    const dashData = await dashResponse.json();
    const foldersData = await foldersResponse.json();
    
    console.log("\n📊 API COMPARISON:");
    console.log("Dashboard API folder count:", dashData.archive.folders);
    console.log("Archive API folder count:", foldersData.length);
    console.log("Discrepancy:", dashData.archive.folders - foldersData.length);
    
    console.log("\n📋 FOLDER DETAILS:");
    console.log("Folders returned by Archive API:");
    foldersData.forEach((folder, index) => {
      console.log(`${index + 1}. "${folder.name}" (${folder.uuid}) - archived: ${folder.is_archived}`);
    });
    
    console.log("\n🕐 TIMESTAMPS:");
    console.log("Dashboard API call timestamp:", new Date().toISOString());
    console.log("Folders API call timestamp:", new Date().toISOString());
    
    // Test with different query parameters
    console.log("\n🧪 TESTING DIFFERENT QUERIES:");
    
    // Try getting ALL folders (including archived)
    const allFoldersResponse = await fetch('/api/v1/archive/folders', { headers });
    if (allFoldersResponse.ok) {
      const allFolders = await allFoldersResponse.json();
      console.log("Total folders (including archived):", allFolders.length);
      
      const archivedFolders = allFolders.filter(f => f.is_archived === true);
      console.log("Archived folders:", archivedFolders.length);
      
      if (archivedFolders.length > 0) {
        console.log("🎯 FOUND ARCHIVED FOLDERS:");
        archivedFolders.forEach(folder => {
          console.log(`- "${folder.name}" (archived: ${folder.is_archived})`);
        });
      }
    }
    
    // Check if any folders have parent_uuid but show in root
    const rootFolders = foldersData.filter(f => !f.parent_uuid);
    const childFolders = foldersData.filter(f => f.parent_uuid);
    
    console.log("\n📁 FOLDER HIERARCHY:");
    console.log("Root folders:", rootFolders.length);
    console.log("Child folders:", childFolders.length);
    
    if (childFolders.length > 0) {
      console.log("Child folders details:");
      childFolders.forEach(folder => {
        console.log(`- "${folder.name}" (parent: ${folder.parent_uuid})`);
      });
    }
    
    // Check for potential database consistency issues
    console.log("\n🔍 POTENTIAL ISSUES:");
    
    if (dashData.archive.folders > foldersData.length) {
      console.log("⚠️ Dashboard shows MORE folders than Archive API");
      console.log("Possible causes:");
      console.log("1. Dashboard counting archived folders incorrectly");
      console.log("2. Archive API filtering too aggressively");
      console.log("3. Database transaction consistency issue");
      console.log("4. Caching issue in one of the APIs");
    } else if (dashData.archive.folders < foldersData.length) {
      console.log("⚠️ Dashboard shows FEWER folders than Archive API");
      console.log("Possible causes:");
      console.log("1. Dashboard API bug in counting logic");
      console.log("2. Archive API returning duplicates or incorrect data");
    } else {
      console.log("✅ Folder counts match! No discrepancy found.");
    }
    
    return {
      dashboard_count: dashData.archive.folders,
      archive_count: foldersData.length,
      folders: foldersData,
      discrepancy: dashData.archive.folders - foldersData.length
    };
    
  } catch (error) {
    console.error("❌ Debug script failed:", error);
  }
}

// Auto-run the debugging
debugFolderDiscrepancy().then(result => {
  if (result && result.discrepancy !== 0) {
    console.log("\n🚨 DISCREPANCY CONFIRMED!");
    console.log("Dashboard count:", result.dashboard_count);
    console.log("Archive count:", result.archive_count);
    console.log("Difference:", result.discrepancy);
    
    console.log("\n💡 NEXT STEPS:");
    console.log("1. Clear browser cache completely");
    console.log("2. Restart Docker containers");
    console.log("3. Check browser Network tab for response differences");
    console.log("4. Report this data to developer for backend investigation");
  }
});

// Export for manual use
window.debugFolderDiscrepancy = debugFolderDiscrepancy; 