import type { SupabaseClient } from '@supabase/supabase-js'

export interface NominationRow {
  scholar_id: number | null
  staff_id: string | null
  scholar_name: string
  student_name: string
  unit_code: string
  unit_name: string | null
  teaching_period: string
  role_of_unit: string
  statement_support: string
}

export interface ScholarRow {
  id: number
  staff_id: string | null
  name: string
  email: string | null
}

export interface GroupedNominee {
  key: string
  scholar: ScholarRow
  nominations: NominationRow[]
}

export interface EmailPreview {
  key: string
  scholarId: number | null
  staffId: string | null
  scholarName: string
  email: string | null
  subject: string
  body: string
  nominationCount: number
}

function cleanText(value: unknown): string {
  return String(value ?? '').trim()
}

function getNomineeKey(scholar: ScholarRow): string {
  if (cleanText(scholar.staff_id)) {
    return `staff:${cleanText(scholar.staff_id)}`
  }

  return `name:${cleanText(scholar.name).toLowerCase()}`
}

function buildEmailBody(
  scholar: ScholarRow,
  nominations: NominationRow[],
): string {
  const comments = nominations
    .map((nomination, index) => {
      const unit = cleanText(nomination.unit_code)
      const teachingPeriod = cleanText(nomination.teaching_period)
      const comment = cleanText(nomination.statement_support)

      return [
        `${index + 1}.`,
        `Unit: ${unit || 'Not provided'}`,
        `Teaching period: ${teachingPeriod || 'Not provided'}`,
        `Comment: ${comment || 'No supporting comment was provided.'}`,
      ].join('\n')
    })
    .join('\n\n')

  return [
    `Dear ${cleanText(scholar.name)},`,
    '',
    'Congratulations! You have received student nominations for the UWA Business School Teaching & Learning Award.',
    '',
    'The following comments were submitted by students in your nominations:',
    '',
    comments || 'No nomination comments are available.',
    '',
    `Total nominations: ${nominations.length}`,
    '',
    'Kind regards,',
    'UWA Business School Administration',
  ].join('\n')
}

async function fetchApprovedNominations(
  supabase: SupabaseClient,
  staffIds?: string[],
): Promise<NominationRow[]> {
  let query = supabase
    .from('nominations')
    .select(
      [
        'scholar_id',
        'staff_id',
        'scholar_name',
        'student_name',
        'unit_code',
        'unit_name',
        'teaching_period',
        'role_of_unit',
        'statement_support',
      ].join(','),
    )
    .eq('approval_status', 'Approved')

  if (staffIds && staffIds.length > 0) {
    query = query.in('staff_id', staffIds)
  }

  const { data, error } = await query

  if (error) {
    throw new Error(
      `Failed to fetch approved nominations: ${error.message}`,
    )
  }

  return (data ?? []) as unknown as NominationRow[]
}

async function fetchScholars(
  supabase: SupabaseClient,
  nominations: NominationRow[],
): Promise<ScholarRow[]> {
  const staffIds = [
    ...new Set(
      nominations
        .map(nomination => cleanText(nomination.staff_id))
        .filter(Boolean),
    ),
  ]

  const scholarIds = [
    ...new Set(
      nominations
        .map(nomination => nomination.scholar_id)
        .filter((id): id is number => id !== null),
    ),
  ]

  let query = supabase
    .from('scholars')
    .select('id,staff_id,name,email')

  if (scholarIds.length > 0) {
    query = query.in('id', scholarIds)
  } else if (staffIds.length > 0) {
    query = query.in('staff_id', staffIds)
  } else {
    return []
  }

  const { data, error } = await query

  if (error) {
    throw new Error(
      `Failed to fetch scholar records: ${error.message}`,
    )
  }

  return (data ?? []) as ScholarRow[]
}

function findScholar(
  nomination: NominationRow,
  scholars: ScholarRow[],
): ScholarRow | null {
  // scholar_id is the primary link between a nomination
  // and the specific teaching record selected by the student.
  if (nomination.scholar_id !== null) {
    const byId = scholars.find(
      scholar => scholar.id === nomination.scholar_id,
    )

    if (byId) {
      return byId
    }
  }

  // Fall back to staff_id only when scholar_id is unavailable
  // or cannot be matched.
  if (cleanText(nomination.staff_id)) {
    const byStaffId = scholars.find(
      scholar =>
        cleanText(scholar.staff_id) ===
        cleanText(nomination.staff_id),
    )

    if (byStaffId) {
      return byStaffId
    }
  }

  // Final fallback for older or incomplete records.
  const byName = scholars.find(
    scholar =>
      cleanText(scholar.name).toLowerCase() ===
      cleanText(nomination.scholar_name).toLowerCase(),
  )

  return byName ?? null
}

function groupNominations(
  nominations: NominationRow[],
  scholars: ScholarRow[],
): GroupedNominee[] {
  const grouped = new Map<string, GroupedNominee>()

  for (const nomination of nominations) {
    const scholar = findScholar(nomination, scholars)

    if (!scholar) {
      continue
    }

    const key = getNomineeKey(scholar)
    const existing = grouped.get(key)

    if (existing) {
      existing.nominations.push(nomination)
      continue
    }

    grouped.set(key, {
      key,
      scholar,
      nominations: [nomination],
    })
  }

  return [...grouped.values()]
}

export async function generateEmailPreviews(
  supabase: SupabaseClient,
  staffIds?: string[],
): Promise<EmailPreview[]> {
  const nominations = await fetchApprovedNominations(
    supabase,
    staffIds,
  )

  if (nominations.length === 0) {
    return []
  }

  const scholars = await fetchScholars(
    supabase,
    nominations,
  )

  const grouped = groupNominations(
    nominations,
    scholars,
  )

  return grouped.map(group => ({
    key: group.key,
    scholarId: group.scholar.id,
    staffId: group.scholar.staff_id,
    scholarName: group.scholar.name,
    email: group.scholar.email,
    subject:
      'UWA Business School - Teaching & Learning Award Nomination Comments',
    body: buildEmailBody(
      group.scholar,
      group.nominations,
    ),
    nominationCount: group.nominations.length,
  }))
}
