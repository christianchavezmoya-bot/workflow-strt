/**
 * Shared behaviour for Strata N-Go training guides (standalone — not part of app bundle).
 */
(function () {
  function qs(sel, root) { return (root || document).querySelector(sel); }
  function qsa(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }

  function setMode(mode) {
    document.body.classList.toggle("read-only", mode === "read");
    qsa(".mode-toggle button").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.mode === mode);
    });
    localStorage.setItem("guide-mode", mode);
  }

  function showStep(stepId) {
    qsa(".step-panel").forEach((p) => p.classList.toggle("active", p.id === stepId));
    qsa(".step-link").forEach((a) => a.classList.toggle("active", a.dataset.step === stepId));
    const panel = document.getElementById(stepId);
    if (panel) panel.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function initGuide() {
    const saved = localStorage.getItem("guide-mode") || "read";
    setMode(saved);

    qsa(".mode-toggle button").forEach((btn) => {
      btn.addEventListener("click", () => setMode(btn.dataset.mode));
    });

    qsa(".step-link").forEach((a) => {
      a.addEventListener("click", (e) => {
        e.preventDefault();
        showStep(a.dataset.step);
      });
    });

    qsa("[data-action]").forEach((el) => {
      el.addEventListener("click", () => {
        if (document.body.classList.contains("read-only")) return;
        const action = el.dataset.action;
        const feedback = el.closest(".step-panel")?.querySelector(".feedback");
        if (feedback) {
          feedback.classList.add("show");
          feedback.classList.add(el.dataset.feedbackClass || "ok");
          feedback.textContent = el.dataset.feedback || "Action completed in this interactive demo.";
        }
        if (action === "next-step" && el.dataset.next) showStep(el.dataset.next);
      });
    });

    const first = qs(".step-link");
    if (first) showStep(first.dataset.step);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initGuide);
  } else {
    initGuide();
  }
})();
