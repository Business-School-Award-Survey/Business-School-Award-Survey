// Central project configuration.
// If Supabase table names or column names change, start from this file.
(() => {
  const supabaseUrl = "https://maoihtefcdmnlnbxntpo.supabase.co"
  const supabaseKey = "sb_publishable_cV-NScvnaMiX-6KRkTXu0g_DFMrhQF6"

  const config = {
    supabaseUrl,
    supabaseKey,

    tables: Object.freeze({
      awardPeriods: "award_periods",
      scholars: "scholars",
      nominations: "nominations"
    }),

    // Current uploaded file uses scholars.id and nominations.scholar_id.
    // If the database has renamed scholar_id to scholar_unique_id, change nominationScholarField only.
    dbFields: Object.freeze({
      scholarPrimaryKey: "id",
      nominationScholarField: "scholar_id"
    }),

    themeOverrides: Object.freeze({
      common: {
        fontFamily: "'DM Sans', sans-serif",
        primaryColor: "#002147",
        primaryColorHover: "#0a3060",
        primaryColorPressed: "#001832",
        primaryColorSuppl: "#0a3060",
        borderRadius: "10px"
      },
      Card: {
        borderRadius: "20px",
        paddingMedium: "34px"
      },
      Input: {
        borderHover: "1px solid #C9A84C",
        borderFocus: "1px solid #C9A84C",
        boxShadowFocus: "0 0 0 3px rgba(201, 168, 76, 0.14)"
      },
      Select: {
        peers: {
          InternalSelection: {
            borderHover: "1px solid #C9A84C",
            borderFocus: "1px solid #C9A84C",
            boxShadowFocus: "0 0 0 3px rgba(201, 168, 76, 0.14)"
          }
        }
      },
      Button: {
        borderRadiusLarge: "10px"
      }
    })
  }

  config.headers = Object.freeze({
    "apikey": supabaseKey,
    "Authorization": `Bearer ${supabaseKey}`,
    "Content-Type": "application/json"
  })

  window.AppConfig = Object.freeze(config)
})()
