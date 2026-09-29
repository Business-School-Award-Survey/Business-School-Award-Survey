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
  const existingSubmission = document.getElementById("existingSubmission") // 中文注释：取得已有提交状态区域。
  const existingSubmissionSummary = document.getElementById("existingSubmissionSummary") // 中文注释：取得已有提交的简短说明。
  const viewSubmissionButton = document.getElementById("viewSubmissionButton") // 中文注释：取得展开上次提交详情的按钮。
  const submissionDetails = document.getElementById("submissionDetails") // 中文注释：取得默认隐藏的上次提交详情区域。
  const submittedFullName = document.getElementById("submittedFullName") // 中文注释：取得上次提交姓名显示位置。
  const submittedCategory = document.getElementById("submittedCategory") // 中文注释：取得上次提交类别显示位置。
  const submittedFileLink = document.getElementById("submittedFileLink") // 中文注释：取得查看上次 PDF 的短时效链接。
  const submittedAt = document.getElementById("submittedAt") // 中文注释：取得上次提交时间显示位置。
  const editApplicationButton = document.getElementById("editApplicationButton") // 中文注释：取得进入修改模式的按钮。
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
  let existingApplication = null // 中文注释：保存后台返回的当前申请摘要供查看和修改使用。
  let editingApplication = false // 中文注释：区分首次提交和修改现有申请两种请求模式。

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

  function showExistingApplication(application) { // 中文注释：把已有申请摘要填入查看区域。
    existingApplication = application // 中文注释：保存当前申请供修改模式预填类别。
    submittedFullName.textContent = String(application.fullName || invitedTeacherName) // 中文注释：显示后台确认的申请人姓名。
    submittedCategory.textContent = String(application.category || "") // 中文注释：显示上次保存的奖项类别。
    submittedFileLink.href = String(application.downloadUrl || "#") // 中文注释：设置由后台生成的短时效 PDF 查看地址。
    submittedFileLink.textContent = String(application.originalFileName || "View submitted PDF") // 中文注释：使用原文件名作为 PDF 链接文字。
    submittedAt.textContent = application.submittedAt ? new Date(application.submittedAt).toLocaleString() : "" // 中文注释：按浏览器所在地区显示提交时间。
    existingSubmissionSummary.textContent = "A saved application is available for this invitation." // 中文注释：提示教师可以查看已保存内容。
    submissionDetails.hidden = true // 中文注释：首次显示状态时保持详情折叠。
    viewSubmissionButton.textContent = "View submission" // 中文注释：重置查看按钮文字。
    existingSubmission.hidden = false // 中文注释：显示已有提交状态区域。
    form.hidden = true // 中文注释：未选择修改前不显示编辑表单。
  } // 中文注释：结束已有申请摘要展示。

  function startEditingApplication() { // 中文注释：进入修改申请模式并复用原提交表单。
    if (!existingApplication) return // 中文注释：没有已有申请数据时拒绝进入修改模式。
    const categoryInput = document.querySelector(`input[name="category"][value="${CSS.escape(existingApplication.category)}"]`) // 中文注释：查找上次提交时选中的类别单选框。
    if (categoryInput) categoryInput.checked = true // 中文注释：自动预选上次保存的申请类别。
    applicationFile.value = "" // 中文注释：浏览器不允许预填文件，因此要求教师重新选择替换 PDF。
    categoryError.textContent = "" // 中文注释：清除进入修改模式前的类别错误。
    fileError.textContent = "Select the replacement PDF file." // 中文注释：说明修改申请时需要重新上传 PDF。
    editingApplication = true // 中文注释：后续提交使用 PUT 更新现有申请。
    submitButton.textContent = "Update application" // 中文注释：把按钮文案切换为修改申请。
    existingSubmission.hidden = true // 中文注释：编辑时隐藏已有提交摘要，避免重复操作。
    successMessage.hidden = true // 中文注释：确保旧的成功信息不会遮挡修改表单。
    form.hidden = false // 中文注释：显示与首次提交相同的申请表。
    form.scrollIntoView({ behavior: "smooth", block: "start" }) // 中文注释：把页面平滑移动到修改表单。
  } // 中文注释：结束进入修改申请模式。

  async function verifyInvitation() {
    if (window.location.protocol === "file:") { // 中文注释：阻止直接双击 HTML 进行无法获得 Supabase Auth 回调会话的错误测试。
      setAccessMessage("Local server required", "Open this form through the generated Magic Link at http://localhost:8000, not as a file:// page.", true) // 中文注释：明确说明本地测试必须使用 HTTP 服务和新生成的 Magic Link。
      existingSubmission.hidden = true // 中文注释：file 协议下不显示可能产生误解的已有提交区域。
      form.hidden = true // 中文注释：file 协议下不允许显示或提交申请表。
      return // 中文注释：停止后续 Supabase 会话和申请状态请求。
    } // 中文注释：结束 file 协议保护分支。
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
        cache: "no-store", // 中文注释：每次打开链接都重新查询当前申请状态，避免复用提交前的旧响应。
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
      editingApplication = false // 中文注释：每次验证邀请后先恢复为非编辑状态。
      submitButton.textContent = "Submit application" // 中文注释：没有已有提交时保留首次提交按钮文案。
      if (invitation.hasSubmission && invitation.application) { // 中文注释：后台发现已有申请时显示查看入口。
        showExistingApplication(invitation.application) // 中文注释：展示已有提交状态并隐藏首次提交表单。
      } else { // 中文注释：没有已有申请时继续原来的首次提交流程。
        existingApplication = null // 中文注释：清除可能残留的旧申请摘要。
        existingSubmission.hidden = true // 中文注释：隐藏已有提交状态区域。
        form.hidden = false // 中文注释：显示首次提交表单。
      } // 中文注释：结束已有申请状态分支。
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

  viewSubmissionButton.addEventListener("click", function () { // 中文注释：点击查看按钮时展开或折叠上次提交内容。
    submissionDetails.hidden = !submissionDetails.hidden // 中文注释：切换详情区域的显示状态。
    viewSubmissionButton.textContent = submissionDetails.hidden ? "View submission" : "Hide submission" // 中文注释：同步更新按钮文字以表达当前操作。
  }) // 中文注释：结束查看提交按钮事件。

  editApplicationButton.addEventListener("click", startEditingApplication) // 中文注释：点击修改申请后进入复用表单的编辑模式。

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
        method: editingApplication ? "PUT" : "POST", // 中文注释：首次提交使用 POST，修改同一条申请使用 PUT。
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "apikey": window.AppConfig.supabaseKey
        },
        body
      })
      await parseResponse(response)
      form.hidden = true
      existingSubmission.hidden = true // 中文注释：保存成功后隐藏旧的已有提交区域。
      successMessage.hidden = false
    } catch (error) {
      if (error.code === "already_submitted") { // 中文注释：旧页面状态下遇到已有申请时立即重新读取真实提交状态。
        await verifyInvitation() // 中文注释：并发提交导致已存在申请时重新加载并显示“查看提交”入口。
      } else { // 中文注释：其他提交错误继续显示原来的具体错误信息。
        fileError.textContent = error.message
      }
    } finally {
      submitButton.disabled = false
      submitButton.textContent = editingApplication ? "Update application" : "Submit application" // 中文注释：失败后保持当前首次提交或修改申请按钮文案。
    }
  })

  void verifyInvitation()
})()
