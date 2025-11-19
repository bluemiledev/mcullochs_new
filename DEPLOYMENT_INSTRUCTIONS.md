# Deployment Instructions for Shared Hosting

## ✅ Configuration Complete
Your application has been configured to run at: **`smartdatalink.com.au/charts/`**

## 📦 Deployment Package
**File:** `deployment.zip` (0.25 MB)
**Location:** `C:\Users\DELL\Desktop\ReactChart\deployment.zip`

## 🚀 Deployment Steps

### Step 1: Upload the Zip File
1. Log into your shared hosting control panel (cPanel, File Manager, or FTP)
2. Navigate to your web root directory:
   - Usually: `public_html`, `www`, or `htdocs`
   - For your domain: `smartdatalink.com.au`
3. Upload `deployment.zip` to the web root

### Step 2: Extract Files
1. **IMPORTANT:** Extract the zip file contents directly into the `charts` folder
   - If the `charts` folder doesn't exist, create it first
   - Extract all files from the zip into: `public_html/charts/` (or `www/charts/` or `htdocs/charts/`)
2. After extraction, you should have:
   ```
   public_html/
   └── charts/
       ├── .htaccess
       ├── index.html
       ├── asset-manifest.json
       ├── manifest.json
       ├── data/
       │   ├── analog-second.json
       │   ├── telemetry.json
       │   └── vehicle-data.json
       └── static/
           ├── css/
           └── js/
   ```

### Step 3: Verify .htaccess File
1. Make sure `.htaccess` is in the `charts` folder (not in the root)
2. Verify the file has read permissions
3. The `.htaccess` file should contain:
   - `RewriteBase /charts/`
   - `RewriteRule . /charts/index.html [L]`

### Step 4: Test the Application
1. Visit: `https://smartdatalink.com.au/charts/`
2. The application should load correctly
3. Test navigation and routes

## 🔧 What Was Configured

1. **Package.json:** Set `homepage: "/charts"`
2. **React Router:** Added `basename="/charts"` to BrowserRouter
3. **.htaccess:** Configured for `/charts/` subdirectory
4. **Build:** All asset paths prefixed with `/charts/`

## ❌ Troubleshooting

### If you see a blank page:
1. Check browser console (F12) for errors
2. Verify `.htaccess` is in the `charts` folder
3. Check file permissions (should be 644 for files, 755 for folders)
4. Verify all files were extracted correctly

### If routes don't work:
1. Ensure `.htaccess` is readable by the server
2. Check if `mod_rewrite` is enabled on your hosting
3. Verify the `.htaccess` RewriteBase is `/charts/`

### If assets don't load:
1. Check that all files in `static/` folder are uploaded
2. Verify paths in browser console
3. Clear browser cache (Ctrl+Shift+Delete)

## 📝 Important Notes

- **DO NOT** extract to the root directory - extract to the `charts` folder
- The `.htaccess` file must be in the `charts` folder, not the root
- All paths are configured for `/charts/` subdirectory
- The application will work at: `smartdatalink.com.au/charts/`

## ✅ Success Indicators

When everything is working:
- ✅ Application loads at `smartdatalink.com.au/charts/`
- ✅ No console errors in browser
- ✅ All assets (CSS, JS) load correctly
- ✅ Navigation and routes work properly
- ✅ Charts and data display correctly

---

**Ready to deploy!** Upload `deployment.zip` and extract to the `charts` folder.










