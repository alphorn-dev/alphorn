// Jenkins Notification Plugin (JSON format). Docs: https://plugins.jenkins.io/notification/
// Source: https://github.com/jenkinsci/notification-plugin (Phase.java, model/BuildState.java)
// The plugin sends no vendor header, so detection is by payload shape.

import {
  str,
  num,
  list,
  lines,
  tags,
  MAX_LIST_ITEMS,
  type AutoSource,
  type Body,
  type AutoResult,
} from "./util";

// Phase enum values sent by the plugin (NONE is never serialized).
const PHASES = new Set(["QUEUED", "STARTED", "COMPLETED", "FINALIZED"]);

function jenkins(body: Body): AutoResult {
  const job = str(body, "name") || "Jenkins job";
  const number = num(body, "build.number");
  const ref = number === null ? "" : ` #${number}`;
  const phase = str(body, "build.phase").toLowerCase();
  // Result name (SUCCESS, UNSTABLE, FAILURE, ABORTED, ...). Absent before the build finishes.
  const status = str(body, "build.status");
  const branch = str(body, "build.scm.branch");
  const commit = str(body, "build.scm.commit");
  const culprits = list(body, "build.scm.culprits")
    .filter((c): c is string => typeof c === "string")
    .slice(0, MAX_LIST_ITEMS);

  return {
    title: `${job}${ref} ${status || phase || "notification"}`,
    message: lines(
      branch ? `branch ${branch}` : "",
      commit ? `commit ${commit}` : "",
      culprits.length > 0 ? `culprits ${culprits.join(", ")}` : "",
      str(body, "build.full_url")
    ),
    priority: status === "FAILURE" ? 4 : status === "UNSTABLE" ? 3 : null,
    tags: tags("jenkins", phase, status.toLowerCase(), job.toLowerCase()),
  };
}

export const jenkinsSource: AutoSource = {
  id: "jenkins",
  detect: (body) =>
    str(body, "name") !== "" &&
    PHASES.has(str(body, "build.phase")) &&
    num(body, "build.number") !== null,
  extract: (body) => jenkins(body),
};
