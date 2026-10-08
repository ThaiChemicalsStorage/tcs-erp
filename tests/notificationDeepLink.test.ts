import { describe, expect, it } from "vitest";
import { readNotificationDeepLink, withoutNotificationDeepLink } from "../src/lib/notificationDeepLink";

// ปุ่ม "เปิดในระบบ" ในข้อความ LINE ชี้ /?n=<id แจ้งเตือน> (Tuhmo #50, 2026-10-08)
describe("notification deep link", () => {
  it("reads only a well-formed notification id", () => {
    expect(readNotificationDeepLink("?n=6ac737a13bbb1b8725ae6938")).toBe("6ac737a13bbb1b8725ae6938");
    expect(readNotificationDeepLink("")).toBeNull();
    expect(readNotificationDeepLink("?n=")).toBeNull();
    expect(readNotificationDeepLink("?n=../../etc")).toBeNull();
    expect(readNotificationDeepLink("?x=1&n=6AC737A13BBB1B8725AE6938")).toBe("6AC737A13BBB1B8725AE6938");
  });

  it("strips n but keeps the other params and the #page hash, so a refresh does not re-open the document", () => {
    expect(withoutNotificationDeepLink("https://erp.test/?n=6ac737a13bbb1b8725ae6938#dashboard")).toBe("/#dashboard");
    expect(withoutNotificationDeepLink("https://erp.test/?a=1&n=6ac737a13bbb1b8725ae6938")).toBe("/?a=1");
  });
});
