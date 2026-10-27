// HTTP client for the authenticated contingency relationship endpoints.
export interface ContingencyLink {
  barrierId: number;
  barrierTag: string;
  contingencyBarrierId: number;
  contingencyTag: string;
  managementChange: string;
  riskAnalysis: string;
  eligible: boolean;
}

export interface ContingencyCandidate {
  id: number;
  tag: string;
}

export interface BarrierContingencies {
  outgoing: ContingencyLink[];
  incoming: ContingencyLink[];
  candidates: ContingencyCandidate[];
  candidatesHaveMore: boolean;
}

export interface ContingencyReferenceInput {
  managementChange: string;
  riskAnalysis: string;
}

function url(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/$/, "")}${path}`;
}

async function request<T>(
  baseUrl: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url(baseUrl, path), {
      ...init,
      credentials: "same-origin",
      headers: {
        "Accept": "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(init.headers ?? {}),
      },
    });
  } catch {
    throw new Error("Falha de conexão, tente novamente");
  }
  if (!response.ok) {
    let message = `Erro ${response.status} ao atualizar contingências`;
    try {
      const body = await response.json() as { error?: unknown };
      if (typeof body.error === "string") message = body.error;
    } catch {
      // Non-JSON error pages use the status-based message above.
    }
    throw new Error(message);
  }
  return await response.json() as T;
}

export function createContingencyApi(baseUrl: string) {
  return {
    get(barrierId: number, query = ""): Promise<BarrierContingencies> {
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      const searchText = params.toString();
      const search = searchText ? `?${searchText}` : "";
      return request(
        baseUrl,
        `/api/barriers/${barrierId}/contingencies${search}`,
      );
    },
    async add(
      barrierId: number,
      contingencyBarrierId: number,
      references: ContingencyReferenceInput,
    ): Promise<void> {
      await request(
        baseUrl,
        `/api/barriers/${barrierId}/contingencies`,
        {
          method: "POST",
          body: JSON.stringify({ contingencyBarrierId, ...references }),
        },
      );
    },
    async update(
      barrierId: number,
      contingencyBarrierId: number,
      references: ContingencyReferenceInput,
    ): Promise<void> {
      await request(
        baseUrl,
        `/api/barriers/${barrierId}/contingencies`,
        {
          method: "PATCH",
          body: JSON.stringify({ contingencyBarrierId, ...references }),
        },
      );
    },
    async remove(
      barrierId: number,
      contingencyBarrierId: number,
    ): Promise<void> {
      const params = new URLSearchParams({
        contingencyBarrierId: String(contingencyBarrierId),
      });
      await request(
        baseUrl,
        `/api/barriers/${barrierId}/contingencies?${params}`,
        { method: "DELETE" },
      );
    },
  };
}
