let url = "https://localhost:6061/benchmark/latest";

export const setBenchmarkUrl = (newUrl: string) => {
  url = newUrl;
};

type Benchmark = {
  start: Date;
  end: Date;
  score: number;
};

export const getLatestBenchmark = async () => {
  const res = await fetch(url);
  if (!res.ok || res.status !== 200) {
    throw new Error(
      `Failed to fetch benchmark(${res.status}): ${await res.text()}`
    );
  }

  const body = (await res.json()) as {
    start: string;
    end: string;
    score: number;
  };

  return {
    start: new Date(body.start),
    end: new Date(body.end),
    score: body.score,
  } as Benchmark;
};
