import { createRouter, createWebHashHistory } from 'vue-router';
import type { RouteRecordRaw } from 'vue-router';
import AdminLayout from '../layouts/AdminLayout.vue';

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    component: AdminLayout,
    redirect: '/dashboard',
    children: [
      {
        path: '/dashboard',
        name: 'dashboard',
        component: () => import('../views/DashboardView.vue'),
      },
      {
        path: '/nominations',
        name: 'nominations',
        component: () => import('../views/NominationsView.vue'),
      },
      {
        path: '/student-responses',
        name: 'student-responses',
        component: () => import('../views/StudentResponseViewer.vue'),
      },
      {
        path: '/applications',
        name: 'applications',
        component: () => import('../views/ApplicationsView.vue'),
      },
      {
        path: '/master-data',
        name: 'master-data',
        component: () => import('../views/MasterDataView.vue'),
      },
      {
        path: '/period-control',
        name: 'period-control',
        component: () => import('../views/PeriodControlView.vue'),
      },
      {
        path: '/notifications',
        name: 'notifications',
        component: () => import('../views/NotificationsView.vue'),
      },
      {
        path: '/data-export',
        name: 'data-export',
        component: () => import('../views/DataExportView.vue'),
      },
      {
        path: '/application-downloads',
        name: 'application-downloads',
        component: () => import('../views/ApplicationDownloadsView.vue'),
      },
    ],
  },
];

export const router = createRouter({
  history: createWebHashHistory(),
  routes,
});
