// Application startup. Keep this file last in index.html.
const initialPage = new URLSearchParams(window.location.search).get("page");
const allowedInitialPages = new Set(["current", "build", "breaks", "food", "tasks", "staffing", "skills", "handover", "history", "cash", "results"]);
showPage(allowedInitialPages.has(initialPage) ? initialPage : "current");
loadProfiles().catch((error) => console.error(error));
