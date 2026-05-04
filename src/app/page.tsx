import { redirect } from "next/navigation";

// Pipeline is the home for this app — `/` just sends users to the deals
// kanban. When auth + multi-tenancy land, this can become a per-org
// dashboard instead of a redirect.
export default function Home() {
  redirect("/deals");
}
