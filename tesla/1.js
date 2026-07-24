// @ts-check

import $ from "jquery";

/**
 *
 * @param {string} today
 * @param {number} limit
 */
function solution(today, limit) {
  let errorCount = 0;
  const todayDate = new Date(today);

  $("table tbody tr").each(function () {
    const row = $(this);

    const styleAttr = row.attr("style") || "";
    const isMarkedRed = styleAttr.includes("background-color") && styleAttr.includes("red");

    const cells = row.find("td");
    const borrowDateStr = $(cells[1]).text().trim();
    const returnDateStr = $(cells[2]).text().trim();

    const borrowDate = new Date(borrowDateStr);

    const dueDate = new Date(borrowDateStr);
    dueDate.setDate(dueDate.getDate() + limit);

    let isOverDue;
    if (returnDateStr) {
      const returnDate = new Date(returnDateStr);
      isOverDue = returnDate > dueDate;
    } else {
      isOverDue = todayDate > dueDate;
    }

    if (isMarkedRed !== isOverDue) {
      errorCount++;
    }
  });
  return errorCount;
}
