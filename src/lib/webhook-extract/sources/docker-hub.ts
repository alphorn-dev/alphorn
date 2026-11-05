// Docker Hub repository webhooks (image push). Docs:
// https://docs.docker.com/docker-hub/repos/manage/webhooks/
// No vendor header, so detection is by payload shape.

import { str, lines, tags, type AutoSource, type Body } from "./util";

export const dockerHubSource: AutoSource = {
  id: "docker-hub",
  detect: (body) =>
    typeof body.push_data === "object" &&
    body.push_data !== null &&
    str(body, "repository.repo_name") !== "" &&
    // callback_url is a legacy field Docker Hub may drop, so it isn't required.
    str(body, "repository.repo_url") !== "",
  extract: (body: Body) => {
    const repo = str(body, "repository.repo_name");
    const tag = str(body, "push_data.tag");
    const pusher = str(body, "push_data.pusher");
    const image = repo ? `${repo}${tag ? `:${tag}` : ""}` : "";
    return {
      title: image ? `Pushed ${image}` : "Docker Hub push",
      message: lines(pusher ? `Pushed by ${pusher}` : "", str(body, "repository.repo_url")),
      // Push is informational; the "status" field only reports the repo state.
      priority: null,
      tags: tags("docker-hub", "push", repo.toLowerCase(), tag.toLowerCase()),
    };
  },
};
