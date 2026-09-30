(() => {
  const MAX_FILE_BYTES = 10 * 1024 * 1024
  const form = document.getElementById("awardForm")
  const fullNameDisplay = document.getElementById("fullNameDisplay")
  const categoryError = document.getElementById("categoryError")
  const applicationFile = document.getElementById("applicationFile")
  const fileError = document.getElementById("fileError")
  const successMessage = document.getElementById("successMessage")
  const submitButton = document.getElementById("submitButton")
  const accessMessage = document.getElementById("accessMessage")
  const accessTitle = document.getElementById("accessTitle")
  const accessDetail = document.getElementById("accessDetail")
  const existingSubmission = document.getElementById("existingSubmission")
  const existingSubmissionSummary = document.getElementById("existingSubmissionSummary")
  const viewSubmissionButton = document.getElementById("viewSubmissionButton")
  const submissionDetails = document.getElementById("submissionDetails")
  const submittedFullName = document.getElementById("submittedFullName")
  const submittedCategory = document.getElementById("submittedCategory")
  const submittedFileLink = document.getElementById("submittedFileLink")
  const submittedAt = document.getElementById("submittedAt")
  const editApplicationButton = document.getElementById("editApplicationButton")
  const functionUrl = `${window.AppConfig.supabaseUrl}/functions/v1/teaching-application`
  const client = window.supabase.createClient(
    window.AppConfig.supabaseUrl,
    window.AppConfig.supabaseKey,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    }
  )

  let accessToken = null
  let invitedTeacherName = ""
  let existingApplication = null
  let editingApplication = false

  function setAccessMessage(title, detail, isError = false) {
    accessTitle.textContent = title
    accessDetail.textContent = detail
    accessMessage.classList.toggle("error-state", isError)
    accessMessage.hidden = false
  }

  async function parseResponse(response) {
    let payload = {}
    try {
      payload = await response.json()
    } catch {
      payload = {}
    }
    if (!response.ok) {
      const error = new Error(payload.error || "The request could not be completed.")
      error.code = payload.code
      throw error
    }
    return payload
  }

  function showExistingApplication(application) {
    existingApplication = application
    submittedFullName.textContent = String(application.fullName || invitedTeacherName)
    submittedCategory.textContent = String(application.category || "")
    submittedFileLink.href = String(application.downloadUrl || "#")
    submittedFileLink.textContent = String(application.originalFileName || "View submitted PDF")
    submittedAt.textContent = application.submittedAt ? new Date(application.submittedAt).toLocaleString() : ""
    existingSubmissionSummary.textContent = "A saved application is available for this invitation."
    submissionDetails.hidden = true
    viewSubmissionButton.textContent = "View submission"
    existingSubmission.hidden = false
    form.hidden = true
  }

  function startEditingApplication() {
    if (!existingApplication) return
    const categoryInput = document.querySelector(`input[name="category"][value="${CSS.escape(existingApplication.category)}"]`)
    if (categoryInput) categoryInput.checked = true
    applicationFile.value = ""
    categoryError.textContent = ""
    fileError.textContent = "Select the replacement PDF file."
    editingApplication = true
    submitButton.textContent = "Update application"
    existingSubmission.hidden = true
    successMessage.hidden = true
    form.hidden = false
    form.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  async function verifyInvitation() {
    if (window.location.protocol === "file:") {
      setAccessMessage("Local server required", "Open this form through the generated Magic Link at http://localhost:8000, not as a file:// page.", true)
      existingSubmission.hidden = true
      form.hidden = true
      return
    }
    const { data, error } = await client.auth.getSession()
    const session = data.session

    if (error || !session?.access_token || !session.user?.email) {
      setAccessMessage(
        "Secure invitation required",
        "Please open the Magic Link from your invitation email. This form cannot be accessed without signing in.",
        true
      )
      return
    }

    accessToken = session.access_token

    try {
      const response = await fetch(functionUrl, {
        method: "GET",
        cache: "no-store",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "apikey": window.AppConfig.supabaseKey
        }
      })
      const invitation = await parseResponse(response)

      if (!invitation.eligible) {
        throw new Error("This invitation cannot be used.")
      }

      invitedTeacherName = String(invitation.teacherName || "").trim()
      if (!invitedTeacherName) throw new Error("The invited teacher name is missing.")
      fullNameDisplay.textContent = invitedTeacherName
      accessMessage.hidden = true
      editingApplication = false
      submitButton.textContent = "Submit application"
      if (invitation.hasSubmission && invitation.application) {
        showExistingApplication(invitation.application)
      } else {
        existingApplication = null
        existingSubmission.hidden = true
        form.hidden = false
      }
    } catch (error) {
      setAccessMessage("Application unavailable", error.message, true)
      form.hidden = true
    }
  }

  function isPdf(file) {
    return Boolean(
      file &&
      file.type === "application/pdf" &&
      file.name.toLowerCase().endsWith(".pdf")
    )
  }

  applicationFile.addEventListener("change", function () {
    const file = applicationFile.files[0]

    if (file && !isPdf(file)) {
      fileError.textContent = "Please upload a PDF file."
      applicationFile.value = ""
      return
    }
    if (file && file.size > MAX_FILE_BYTES) {
      fileError.textContent = "The PDF must be 10 MB or smaller."
      applicationFile.value = ""
      return
    }
    fileError.textContent = ""
  })

  viewSubmissionButton.addEventListener("click", function () {
    submissionDetails.hidden = !submissionDetails.hidden
    viewSubmissionButton.textContent = submissionDetails.hidden ? "View submission" : "Hide submission"
  })

  editApplicationButton.addEventListener("click", startEditingApplication)

  form.addEventListener("submit", async function (event) {
    event.preventDefault()

    const selectedCategory = document.querySelector('input[name="category"]:checked')
    const file = applicationFile.files[0]
    const fileIsValid = isPdf(file) && file.size <= MAX_FILE_BYTES

    categoryError.textContent = selectedCategory ? "" : "Please select an award category."
    fileError.textContent = fileIsValid
      ? ""
      : "Please upload your application as a PDF file no larger than 10 MB."

    if (!invitedTeacherName) {
      form.hidden = true
      setAccessMessage("Application unavailable", "The invited teacher name is missing.", true)
      return
    }
    if (!selectedCategory) {
      document.querySelector('input[name="category"]').focus()
      return
    }
    if (!fileIsValid) {
      applicationFile.focus()
      return
    }

    const { data } = await client.auth.getSession()
    accessToken = data.session?.access_token ?? null
    if (!accessToken) {
      form.hidden = true
      setAccessMessage("Sign-in expired", "Please open your invitation link again.", true)
      return
    }

    const body = new FormData()
    body.append("category", selectedCategory.value)
    body.append("applicationFile", file)

    submitButton.disabled = true
    submitButton.textContent = "Submitting..."

    try {
      const response = await fetch(functionUrl, {
        method: editingApplication ? "PUT" : "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "apikey": window.AppConfig.supabaseKey
        },
        body
      })
      await parseResponse(response)
      form.hidden = true
      existingSubmission.hidden = true
      successMessage.hidden = false
    } catch (error) {
      if (error.code === "already_submitted") {
        await verifyInvitation()
      } else {
        fileError.textContent = error.message
      }
    } finally {
      submitButton.disabled = false
      submitButton.textContent = editingApplication ? "Update application" : "Submit application"
    }
  })

  void verifyInvitation()
})()
