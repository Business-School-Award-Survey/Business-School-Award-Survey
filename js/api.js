// Supabase REST API calls are kept here so database-related changes do not mix with UI logic.
window.ApiClient = (() => {
  const { supabaseUrl, headers, tables, dbFields } = window.AppConfig

  const scholarColumns = [
    dbFields.scholarPrimaryKey,
    "name",
    "unit",
    "unit_name",
    "teaching_period",
    "role_of_unit"
  ].join(",")

  function endpoint(tableName, params) {
    const query = params ? `?${params.toString()}` : ""
    return `${supabaseUrl}/rest/v1/${tableName}${query}`
  }

  async function fetchJson(url, options = {}, errorMessage = "Request failed") {
    const res = await fetch(url, { headers, ...options })

    if (!res.ok) {
      const errorText = await res.text()
      throw new Error(`${errorMessage}: ${errorText || res.status}`)
    }

    if (res.status === 204) return null
    return res.json()
  }

  async function getOpenAwardPeriod(nowIso) {
    const params = new URLSearchParams({
      is_active: "eq.true",
      nomination_open_at: `lte.${nowIso}`,
      nomination_close_at: `gt.${nowIso}`,
      select: "id,name,nomination_open_at,nomination_close_at",
      order: "nomination_close_at.asc",
      limit: "1"
    })

    const data = await fetchJson(
      endpoint(tables.awardPeriods, params),
      {},
      "Failed to fetch open award period"
    )

    return Array.isArray(data) ? data[0] : data
  }

  async function getActiveAwardPeriods() {
    const params = new URLSearchParams({
      is_active: "eq.true",
      select: "id,name,nomination_open_at,nomination_close_at",
      order: "nomination_open_at.asc"
    })

    const data = await fetchJson(
      endpoint(tables.awardPeriods, params),
      {},
      "Failed to fetch active award periods"
    )

    return Array.isArray(data) ? data : []
  }

  async function searchScholarsByName(query) {
    const params = new URLSearchParams({
      name: `ilike.*${query}*`,
      select: scholarColumns,
      limit: "6"
    })

    const data = await fetchJson(
      endpoint(tables.scholars, params),
      {},
      "Failed to fetch scholars"
    )

    return data || []
  }

  async function searchScholarsByUnit(query) {
    const params = new URLSearchParams({
      unit: `ilike.*${query}*`,
      select: scholarColumns,
      order: "name.asc",
      limit: "20"
    })

    const data = await fetchJson(
      endpoint(tables.scholars, params),
      {},
      "Failed to search by unit code"
    )

    return data || []
  }

  async function submitNomination(payload) {
    const res = await fetch(endpoint(tables.nominations), {
      method: "POST",
      headers: { ...headers, "Prefer": "return=minimal" },
      body: JSON.stringify(payload)
    })

    if (!res.ok && res.status !== 201) {
      const errorText = await res.text()
      throw new Error(`Submission failed: ${errorText || res.status}`)
    }
  }

  return {
    getOpenAwardPeriod,
    getActiveAwardPeriods,
    searchScholarsByName,
    searchScholarsByUnit,
    submitNomination
  }
})()
