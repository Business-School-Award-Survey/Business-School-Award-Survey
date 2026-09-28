<template>
  <div class="notifications-view">
    <n-h2 style="margin-bottom: 20px;">
      Notifications
    </n-h2>

    <!-- Email preparation -->
    <n-card
      title="Prepare Nomination Emails"
      style="margin-bottom: 24px;"
    >
      <n-alert
        type="info"
        style="margin-bottom: 16px;"
      >
        Approved student nominations are grouped by nominee and their
        supporting comments are combined into one email preview.
        Emails are not sent automatically.
      </n-alert>

      <n-flex justify="space-between" align="center">
        <div>
          <n-text strong>
            Prepare emails from approved nominations
          </n-text>

          <br />

          <n-text
            depth="3"
            style="font-size: 13px;"
          >
            One email preview will be prepared for each nominated academic.
          </n-text>
        </div>

        <n-button
          type="primary"
          :loading="loading"
          @click="prepareEmails"
        >
          <template #icon>
            <n-icon>
              <MailOutline />
            </n-icon>
          </template>

          Prepare Emails
        </n-button>
      </n-flex>
    </n-card>

    <!-- Email Preview Modal -->
    <n-modal
      v-model:show="showPreview"
      preset="card"
      title="Email Preview"
      style="width: 800px; max-width: 90vw; max-height: 80vh; overflow: hidden;"
    >
      <n-flex
        justify="space-between"
        align="center"
        style="margin-bottom: 16px;"
      >
        <n-text>
          {{ selectedRecipientCount }} email(s) selected
        </n-text>

        <n-flex>
          <n-button
            type="primary"
            ghost
            :disabled="selectedPreviewEmails.length === 0"
            @click="exportCSV"
          >
            Export as CSV
          </n-button>
        </n-flex>
      </n-flex>

      <!-- Missing email warning -->
      <n-alert
        v-if="previewEmails.some(email => !email.email)"
        type="warning"
        style="margin-bottom: 16px;"
      >
        Some recipients do not have an email address in the scholar records.
        They can still be selected, but their email address will be blank in
        the exported CSV.
      </n-alert>

      <!-- Recipient selection -->
      <n-card
        size="small"
        style="margin-bottom: 16px;"
      >
        <n-flex
          justify="space-between"
          align="center"
          style="margin-bottom: 12px;"
        >
          <n-text strong>
            Select Recipients
          </n-text>

          <n-text depth="3">
            {{ selectedRecipientCount }} selected
          </n-text>
        </n-flex>

        <n-space vertical>
          <n-checkbox
            v-for="recipient in recipients"
            :key="recipient.key"
            v-model:checked="recipient.selected"
          >
            <n-flex
              vertical
              :size="0"
            >
              <n-text>
                {{ recipient.scholarName }}
              </n-text>

              <n-text
                depth="3"
                style="font-size: 12px;"
              >
                {{ recipient.email || 'Email not available' }}
                ·
                {{ recipient.nominationCount }} nomination(s)
              </n-text>
            </n-flex>
          </n-checkbox>
        </n-space>
      </n-card>

      <!-- Preview -->
      <n-scrollbar
        style="max-height: 55vh;"
      >
        <n-collapse>
          <n-collapse-item
            v-for="email in selectedPreviewEmails"
            :key="email.key"
            :title="`${email.scholarName} · ${email.email || 'No email address'}`"
          >
            <n-space vertical>
              <n-text strong>
                Subject: {{ email.subject }}
              </n-text>

              <n-text depth="3">
                {{ email.nominationCount }} nomination(s)
              </n-text>

              <n-divider />

              <div
                style="
                  white-space: pre-wrap;
                  font-size: 13px;
                  line-height: 1.6;
                "
              >
                {{ email.body }}
              </div>
            </n-space>
          </n-collapse-item>
        </n-collapse>

        <n-empty
          v-if="selectedPreviewEmails.length === 0"
          description="No recipients selected."
          style="padding: 30px 0;"
        />
      </n-scrollbar>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';

import {
  NAlert,
  NButton,
  NCard,
  NCheckbox,
  NCollapse,
  NCollapseItem,
  NDivider,
  NEmpty,
  NFlex,
  NH2,
  NIcon,
  NScrollbar,
  NSpace,
  NText,
  useMessage,
} from 'naive-ui';

import {
  MailOutline,
} from '@vicons/ionicons5';

const message = useMessage();

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

interface EmailPreview {
  key: string;
  scholarId: number | null;
  staffId: string | null;
  scholarName: string;
  email: string | null;
  subject: string;
  body: string;
  nominationCount: number;
}

interface EmailRecipient {
  key: string;
  staffId: string | null;
  scholarName: string;
  email: string | null;
  nominationCount: number;
  selected: boolean;
}

/* -------------------------------------------------------------------------- */
/* State                                                                      */
/* -------------------------------------------------------------------------- */

const loading = ref(false);

const showPreview = ref(false);

const previewEmails = ref<EmailPreview[]>([]);

const recipients = ref<EmailRecipient[]>([]);

/* -------------------------------------------------------------------------- */
/* Computed values                                                            */
/* -------------------------------------------------------------------------- */

const selectedRecipientCount = computed(() =>
  recipients.value.filter(
    recipient => recipient.selected,
  ).length,
);

const selectedPreviewEmails = computed(() =>
  previewEmails.value.filter(email =>
    recipients.value.some(
      recipient =>
        recipient.key === email.key &&
        recipient.selected,
    ),
  ),
);

/* -------------------------------------------------------------------------- */
/* Prepare emails                                                             */
/* -------------------------------------------------------------------------- */

async function prepareEmails(): Promise<void> {
  loading.value = true;

  try {
    const result =
      await window.electronAPI.generateEmailPreviews();

    if (!result.success) {
      message.error(
        result.error ?? 'Failed to prepare emails.',
      );

      return;
    }

    const emails =
      (result.data ?? []) as EmailPreview[];

    if (emails.length === 0) {
      previewEmails.value = [];
      recipients.value = [];
      showPreview.value = false;

      message.info(
        'No approved nominations are available for email preparation.',
      );

      return;
    }

    previewEmails.value = emails;

    recipients.value = emails.map(email => ({
      key: email.key,
      staffId: email.staffId,
      scholarName: email.scholarName,
      email: email.email,
      nominationCount: email.nominationCount,
      selected: true,
    }));

    showPreview.value = true;

    message.success(
      `${emails.length} email(s) prepared.`,
    );
  } catch (error) {
    message.error(
      error instanceof Error
        ? error.message
        : String(error),
    );
  } finally {
    loading.value = false;
  }
}

/* -------------------------------------------------------------------------- */
/* CSV export                                                                 */
/* -------------------------------------------------------------------------- */

function csvEscape(
  value: string | number | null,
): string {
  const text = String(value ?? '');

  return `"${text.replace(/"/g, '""')}"`;
}

function exportCSV(): void {
  const emails = selectedPreviewEmails.value;

  if (emails.length === 0) {
    message.info(
      'There are no selected emails to export.',
    );

    return;
  }

  const headers = [
    'Recipient Name',
    'Email',
    'Subject',
    'Nomination Count',
    'Body',
  ];

  const rows = emails.map(email => [
    csvEscape(email.scholarName),
    csvEscape(email.email),
    csvEscape(email.subject),
    csvEscape(email.nominationCount),
    csvEscape(email.body),
  ]);

  const csv = [
    headers.map(csvEscape),
    ...rows,
  ]
    .map(row => row.join(','))
    .join('\r\n');

  const blob = new Blob(
    [csv],
    {
      type: 'text/csv;charset=utf-8;',
    },
  );

  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');

  link.href = url;

  link.download =
    `email_preparation_${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;

  document.body.appendChild(link);

  link.click();

  document.body.removeChild(link);

  URL.revokeObjectURL(url);

  message.success(
    `${emails.length} email(s) exported.`,
  );
}
</script>

<style scoped>
.notifications-view {
  max-width: 1100px;
}
</style>