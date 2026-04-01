export function matchesSearch(value: string | null | undefined, query: string) {
  if (!query) {
    return true;
  }

  return (value || "").toLowerCase().includes(query.toLowerCase());
}

export function matchesStatus(status: string | null | undefined, selectedStatus: string) {
  if (!selectedStatus || selectedStatus === "all") {
    return true;
  }

  return status === selectedStatus;
}
