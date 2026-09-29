<template>
  <div class="application-downloads-view">
    <n-flex justify="space-between" align="center" style="margin-bottom: 20px;">
      <div>
        <n-h2 style="margin: 0 0 4px;">Application Downloads</n-h2>
        <n-text depth="3">Review and download submitted PDFs grouped by award category.</n-text>
      </div>
      <n-button
        type="primary"
        :disabled="!selectedPeriodId || applications.length === 0"
        :loading="downloadingAll"
        @click="downloadAll"
      >
        <template #icon><n-icon><DownloadOutline /></n-icon></template>
        Download All Categories
      </n-button>
    </n-flex>

    <n-card size="small" style="margin-bottom: 16px;">
      <n-flex align="center" :gap="12">
        <n-text strong>Award period</n-text>
        <n-select
          v-model:value="selectedPeriodId"
          :options="periodOptions"
          :loading="loadingPeriods"
          placeholder="Select an award period"
          style="width: 300px;"
          @update:value="loadApplications"
        />
        <n-button :loading="loadingApplications" :disabled="!selectedPeriodId" @click="loadApplications">
          Refresh
        </n-button>
      </n-flex>
    </n-card>

    <n-alert v-if="errorMessage" type="error" closable style="margin-bottom: 16px;" @close="errorMessage = ''">
      {{ errorMessage }}
    </n-alert>

    <n-spin :show="loadingApplications">
      <n-empty
        v-if="!selectedPeriodId"
        description="Select an award period to view application PDFs."
        style="padding: 64px 0;"
      />

      <n-grid v-else :cols="1" :y-gap="12">
        <n-gi v-for="group in categoryGroups" :key="group.category">
          <n-card
            size="small"
            class="category-card"
            :class="{ expanded: expandedCategory === group.category }"
            @click="toggleCategory(group.category)"
          >
            <n-flex justify="space-between" align="center">
              <n-flex align="center" :gap="12">
                <span class="expand-indicator">{{ expandedCategory === group.category ? '▾' : '▸' }}</span>
                <div>
                  <n-text strong>{{ group.category }}</n-text>
                  <div>
                    <n-text depth="3" style="font-size: 13px;">
                      {{ group.applications.length }} PDF{{ group.applications.length === 1 ? '' : 's' }}
                      · {{ formatFileSize(group.totalBytes) }}
                    </n-text>
                  </div>
                </div>
              </n-flex>
              <n-button
                size="small"
                :disabled="group.applications.length === 0"
                :loading="downloadingCategory === group.category"
                @click.stop="downloadCategory(group.category)"
              >
                <template #icon><n-icon><DownloadOutline /></n-icon></template>
                Download ZIP
              </n-button>
            </n-flex>

            <div v-if="expandedCategory === group.category" class="category-files" @click.stop>
              <n-empty
                v-if="group.applications.length === 0"
                description="No applications have been submitted in this category."
                size="small"
              />
              <n-data-table
                v-else
                :columns="columns"
                :data="group.applications"
                :bordered="false"
                :pagination="group.applications.length > 10 ? { pageSize: 10 } : false"
                size="small"
              />
            </div>
          </n-card>
        </n-gi>
      </n-grid>
    </n-spin>
  </div>
</template>

<script setup lang="ts">
import { computed, h, onMounted, ref } from 'vue';
import {
  NAlert,
  NButton,
  NCard,
  NDataTable,
  NEmpty,
  NFlex,
  NGi,
  NGrid,
  NH2,
  NIcon,
  NSelect,
  NSpin,
  NText,
  useMessage,
} from 'naive-ui';
import type { DataTableColumns, SelectOption } from 'naive-ui';
import { DownloadOutline } from '@vicons/ionicons5';
import {
  TEACHING_AWARD_CATEGORIES,
  TeachingAwardApplication,
  TeachingAwardCategory,
} from '../../shared/types';

const message = useMessage();
const periods = ref<{ id: string; name: string; isActive: boolean }[]>([]);
const selectedPeriodId = ref<string | null>(null);
const applications = ref<TeachingAwardApplication[]>([]);
const expandedCategory = ref<TeachingAwardCategory | null>(null);
const loadingPeriods = ref(false);
const loadingApplications = ref(false);
const downloadingApplicationId = ref<string | null>(null);
const downloadingCategory = ref<TeachingAwardCategory | null>(null);
const downloadingAll = ref(false);
const errorMessage = ref('');

const periodOptions = computed<SelectOption[]>(() =>
  periods.value.map(period => ({
    label: `${period.name}${period.isActive ? ' (Active)' : ''}`,
    value: period.id,
  })),
);

const categoryGroups = computed(() =>
  TEACHING_AWARD_CATEGORIES.map(category => {
    const categoryApplications = applications.value.filter(application => application.category === category);
    return {
      category,
      applications: categoryApplications,
      totalBytes: categoryApplications.reduce((total, application) => total + application.fileSizeBytes, 0),
    };
  }).filter(group => group.applications.length > 0),
);

const columns: DataTableColumns<TeachingAwardApplication> = [
  { title: 'Applicant', key: 'fullName', minWidth: 170, ellipsis: { tooltip: true } },
  { title: 'PDF', key: 'originalFileName', minWidth: 210, ellipsis: { tooltip: true } },
  { title: 'Size', key: 'fileSizeBytes', width: 100, render: row => formatFileSize(row.fileSizeBytes) },
  { title: 'Submitted', key: 'submittedAt', width: 150, render: row => formatDate(row.submittedAt) },
  {
    title: 'Action',
    key: 'action',
    width: 120,
    render: row => h(
      NButton,
      {
        size: 'small',
        loading: downloadingApplicationId.value === row.id,
        onClick: () => downloadApplication(row),
      },
      {
        icon: () => h(NIcon, null, { default: () => h(DownloadOutline) }),
        default: () => 'Download',
      },
    ),
  },
];

onMounted(loadPeriods);

async function loadPeriods() {
  loadingPeriods.value = true;
  errorMessage.value = '';

  try {
    const result = await window.electronAPI.listAwardPeriods();
    if (!result.success || !result.data) throw new Error(result.error || 'Unable to load award periods.');

    periods.value = result.data;
    selectedPeriodId.value = result.data.find(period => period.isActive)?.id ?? result.data[0]?.id ?? null;
    if (selectedPeriodId.value) await loadApplications();
  } catch (error) {
    errorMessage.value = toErrorMessage(error);
  } finally {
    loadingPeriods.value = false;
  }
}

async function loadApplications() {
  if (!selectedPeriodId.value) return;
  loadingApplications.value = true;
  errorMessage.value = '';
  expandedCategory.value = null;

  try {
    const result = await window.electronAPI.listTeachingAwardApplications({
      awardPeriodId: selectedPeriodId.value,
    });
    if (!result.success || !result.data) throw new Error(result.error || 'Unable to load applications.');
    applications.value = result.data;
  } catch (error) {
    applications.value = [];
    errorMessage.value = toErrorMessage(error);
  } finally {
    loadingApplications.value = false;
  }
}

function toggleCategory(category: TeachingAwardCategory) {
  expandedCategory.value = expandedCategory.value === category ? null : category;
}

async function downloadApplication(application: TeachingAwardApplication) {
  downloadingApplicationId.value = application.id;
  errorMessage.value = '';

  try {
    const result = await window.electronAPI.downloadTeachingAwardApplication({ applicationId: application.id });
    if (!result.success || !result.data) throw new Error(result.error || 'Unable to download the PDF.');
    if (!result.data.cancelled) message.success(`${application.originalFileName} downloaded.`);
  } catch (error) {
    errorMessage.value = toErrorMessage(error);
  } finally {
    downloadingApplicationId.value = null;
  }
}

async function downloadCategory(category: TeachingAwardCategory) {
  if (!selectedPeriodId.value) return;
  downloadingCategory.value = category;
  await downloadZip({ awardPeriodId: selectedPeriodId.value, category });
  downloadingCategory.value = null;
}

async function downloadAll() {
  if (!selectedPeriodId.value) return;
  downloadingAll.value = true;
  await downloadZip({ awardPeriodId: selectedPeriodId.value });
  downloadingAll.value = false;
}

async function downloadZip(payload: { awardPeriodId: string; category?: TeachingAwardCategory }) {
  errorMessage.value = '';

  try {
    const result = await window.electronAPI.downloadTeachingAwardApplicationsZip(payload);
    if (!result.success || !result.data) throw new Error(result.error || 'Unable to create the ZIP file.');
    if (result.data.cancelled) return;

    if (result.data.failures.length > 0) {
      const failedFiles = result.data.failures
        .map(failure => `${failure.fileName} (${failure.applicationId.slice(0, 8)}): ${failure.error}`)
        .join('; ');
      errorMessage.value = `The ZIP was saved, but ${result.data.failures.length} PDF(s) failed: ${failedFiles}`;
      message.warning(
        `Downloaded ${result.data.downloadedCount} PDFs; ${result.data.failures.length} could not be downloaded.`,
        { duration: 7000 },
      );
    } else {
      message.success(`Downloaded ${result.data.downloadedCount} PDFs.`);
    }
  } catch (error) {
    errorMessage.value = toErrorMessage(error);
  }
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en-AU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'An unexpected error occurred.';
}
</script>

<style scoped>
.application-downloads-view {
  max-width: 1200px;
}

.category-card {
  cursor: pointer;
  transition: border-color 0.15s ease;
}

.category-card:hover,
.category-card.expanded {
  border-color: #18a058;
}

.expand-indicator {
  color: #18a058;
  font-size: 18px;
  width: 16px;
}

.category-files {
  border-top: 1px solid #efeff5;
  cursor: default;
  margin-top: 16px;
  padding-top: 12px;
}
</style>
