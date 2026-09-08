// Application startup. Keep this file last in index.html.
showPage("current");
loadProfiles().catch((error) => console.error(error));
