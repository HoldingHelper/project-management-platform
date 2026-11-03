import { formatNotificationBody } from "@/lib/format";
import type { NotificationRead } from "@/lib/types";

/** Translate system-generated notification templates while preserving user content. */
export function notificationText(n: Pick<NotificationRead, "type" | "title" | "body">, locale: string) {
  const body = formatNotificationBody(n.body);
  if (locale !== "fa") return { title: n.title, body };
  const titles: Record<string, string> = {
    "A ticket needs your attention": "یک تیکت به رسیدگی شما نیاز دارد",
    "You were assigned a task": "کاری به شما واگذار شد",
    "A blocker is pending on you": "یک مانع در انتظار اقدام شماست",
    "Your task gained a dependency": "یک وابستگی به کار شما اضافه شد",
    "You were added to a project": "به یک پروژه اضافه شدید",
    "New direct message": "پیام مستقیم جدید",
    "AI project committed": "پروژهٔ هوش مصنوعی ثبت شد",
  };
  const status: Record<string, string> = { "not-started": "شروع‌نشده", "in-progress": "در حال انجام", "on-hold": "متوقف", completed: "تکمیل‌شده", cancelled: "لغوشده", archived: "بایگانی‌شده" };
  let title = titles[n.title] ?? n.title;
  let text = body;
  if (n.type === "mention") title = title.replace(/^(.+) mentioned you in a comment$/, "$1 در یک دیدگاه به شما اشاره کرد");
  if (n.type === "chat_mention") title = title.replace(/^You were mentioned in #(.+)$/, "در کانال #$1 به شما اشاره شد");
  if (n.type === "project_update") {
    title = title.replace(/^Project '(.+)' is now (.+)$/, (_, name: string, value: string) => `وضعیت پروژهٔ «${name}» به ${status[value] ?? value} تغییر کرد`);
    text = text.replace(/^Status changed from (.+) to (.+)\.$/, (_, old: string, next: string) => `وضعیت از ${status[old] ?? old} به ${status[next] ?? next} تغییر کرد.`);
  }
  if (n.type === "task_assigned" || n.type === "ticket_assigned") {
    text = text.replace(/^(Task|Ticket) (.+?)(?: in (.+?))? (was assigned to you|was sent to you)\.$/, (_, kind: string, task: string, project: string | undefined) => `${kind === "Task" ? "کار" : "تیکت"} ${task}${project ? ` در پروژهٔ ${project}` : ""} به شما واگذار شد.`);
  }
  if (n.type === "blocker_raised") text = text.replace(/^Blocker on (.+?) is waiting on your action\.(?: Details: (.*))?$/, (_, item: string, details: string | undefined) => `مانع مربوط به ${item} در انتظار اقدام شماست.${details ? ` جزئیات: ${details}` : ""}`);
  if (n.type === "dependency_assigned") text = text.replace(/^(.+) now depends on (.+)\.$/, "$1 اکنون به $2 وابسته است.");
  if (n.type === "project_member_added") text = text.replace(/^You were added to (.+) as (.+)\.$/, "شما با نقش $2 به $1 اضافه شدید.");
  if (n.type === "project_generated") text = text.replace(/^(.+) was created with (\d+) generated tasks\.$/, "پروژهٔ $1 با $2 کار تولیدشده ایجاد شد.");
  if (n.type === "meeting_reminder_10m") {
    title = title.replace(/^Upcoming Meeting in 10 min: (.+)$/, "جلسه تا ۱۰ دقیقهٔ دیگر: $1");
    text = text.replace(/^Starting at (.+?)\.(?: \[Join: (.+)\])?$/, (_, time: string, link: string | undefined) => `شروع در ${time}.${link ? ` پیوستن: ${link}` : ""}`);
  }
  if (n.type === "meeting_reminder_2m") {
    title = title.replace(/^Meeting starting now: (.+)$/, "جلسه در حال شروع: $1");
    text = text.replace(/^Your meeting is starting in 2 minutes!/, "جلسهٔ شما تا ۲ دقیقهٔ دیگر شروع می‌شود.").replace(" [Join: ", " [پیوستن: ");
  }
  if (n.type === "dm" && text === "[voice message]") text = "[پیام صوتی]";
  return { title, body: text };
}
