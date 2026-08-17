/**
 * Canonical Pro-C customer domains shared by the homepage and Agent Square.
 * The recording domain is a workflow entry, but remains in the same taxonomy
 * so employees can be discovered from the same customer-facing navigation.
 */
export const CUSTOMER_DOMAIN_LABELS = Object.freeze({
  sales: "销售",
  "customer-success": "客户成功",
  recruiting: "招聘猎头",
  education: "教育培训",
  "professional-services": "专业服务",
  ear: "录音总结"
});

export const CUSTOMER_DOMAIN_IDS = Object.freeze(Object.keys(CUSTOMER_DOMAIN_LABELS));

export const CUSTOMER_DOMAIN_ORDER = Object.freeze([
  "sales",
  "customer-success",
  "recruiting",
  "education",
  "professional-services",
  "ear"
]);
