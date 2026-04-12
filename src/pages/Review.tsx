/**
 * Review - Human approval workspace
 * 
 * Wraps the existing QA Review Inbox as the Review workspace.
 * Future: Product testing approval will also live here.
 */

import QAReviewInbox from "./QAReviewInbox";

export default function Review() {
  return <QAReviewInbox />;
}
