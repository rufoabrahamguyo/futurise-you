/** Shapes returned by /api/v1. Keep in sync with the DRF serializers. */

export interface Page<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface User {
  id: string;
  email: string;
  full_name: string;
  timezone: string;
  email_notifications: boolean;
  is_email_verified: boolean;
  ai_acknowledged_at: string | null;
  created_at: string;
}

export interface Choice {
  value: string;
  label: string;
}

export interface Meta {
  statuses: Choice[];
  employment_types: Choice[];
  work_arrangements: Choice[];
  document_types: Choice[];
  image_document_types: string[];
  reminder_types: Choice[];
  activity_types: Choice[];
  manual_activity_types: string[];
  max_upload_bytes: number;
  ai_daily_limit: number;
}

export interface Company {
  id: string;
  name: string;
}

export interface CompletenessItem {
  key: "job_description" | "submitted_documents" | "history";
  label: string;
  complete: boolean;
}

export interface Completeness {
  percent: number;
  items: CompletenessItem[];
}

export interface ApplicationSummary {
  id: string;
  company: Company;
  job_title: string;
  location: string;
  employment_type: string;
  work_arrangement: string;
  status: string;
  deadline: string | null;
  date_applied: string | null;
  submitted_at: string | null;
  completeness: Completeness;
  has_cv_attached: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface Application extends ApplicationSummary {
  compensation: string;
  job_url: string;
  recruiter_name: string;
  recruiter_email: string;
  recruiter_phone: string;
  notes: string;
  status_changed_at: string;
}

export interface ApplicationInput {
  company_id?: string;
  company_name?: string;
  job_title?: string;
  location?: string;
  employment_type?: string;
  work_arrangement?: string;
  compensation?: string;
  job_url?: string;
  deadline?: string | null;
  date_applied?: string | null;
  recruiter_name?: string;
  recruiter_email?: string;
  recruiter_phone?: string;
  notes?: string;
}

export interface StatusChangeResult {
  application: Application;
  warnings: string[];
}

export interface Activity {
  id: string;
  type: string;
  title: string;
  body: string;
  metadata: Record<string, unknown>;
  occurred_at: string;
  is_system_generated: boolean;
  created_at: string;
  updated_at: string;
}

export interface Question {
  id: string;
  question: string;
  answer: string;
  order: number;
  created_at: string;
  updated_at: string;
}

export interface ReminderApplication {
  id: string;
  job_title: string;
  company_name: string;
  status: string;
}

export interface Reminder {
  id: string;
  application: ReminderApplication;
  type: string;
  title: string;
  notes: string;
  remind_at: string;
  channels: ("in_app" | "email")[];
  status: "pending" | "sent" | "completed" | "cancelled";
  sent_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DashboardSummary {
  counts: {
    total: number;
    in_progress: number;
    interviews: number;
    offers: number;
    rejections: number;
    follow_ups_due: number;
  };
  by_status: Record<string, number>;
  recent: ApplicationSummary[];
  upcoming_reminders: Reminder[];
  activity: { date: string; count: number }[];
}

export interface AppNotification {
  id: string;
  kind: "reminder" | "export";
  title: string;
  body: string;
  link: string;
  read_at: string | null;
  created_at: string;
}
