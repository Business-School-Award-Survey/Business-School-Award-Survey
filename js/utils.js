// Small reusable helpers that do not depend on Vue or Supabase.
window.AppUtils = (() => {
  function getWordCount(text) {
    return String(text || "").trim().split(/\s+/).filter(Boolean).length
  }

  function formatDateTime(value) {
    if (!value) return "Not set"
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return String(value)

    return date.toLocaleString([], {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    })
  }

  function makeScholarOption(scholar, primaryKey = "id") {
    const details = [scholar.unit, scholar.unit_name, scholar.teaching_period, scholar.role_of_unit]
      .filter(Boolean)
      .join(" · ")

    return {
      label: details ? `${scholar.name} — ${details}` : scholar.name,
      value: scholar[primaryKey],
      scholar
    }
  }

  return {
    getWordCount,
    formatDateTime,
    makeScholarOption
  }
})()
