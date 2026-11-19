function getBucketMap(history) {
  return new Map(
    (Array.isArray(history?.buckets) ? history.buckets : []).map((bucket) => [
      `${bucket.day_of_week}:${bucket.hour_of_day}`,
      bucket,
    ]),
  );
}

function getCorridorSpeed(edges, bucketMaps, distancesKm, dayOfWeek, hour) {
  let totalDistance = 0;
  let totalTravelTime = 0;

  edges.forEach((edge, index) => {
    const bucket = bucketMaps[index].get(`${dayOfWeek}:${hour}`);
    const speed = Number(bucket?.average_speed);
    const sampleCount = Number(bucket?.sample_count);
    const distance = Number(distancesKm[index]);
    if (
      !Number.isFinite(speed) ||
      speed <= 0 ||
      !Number.isFinite(sampleCount) ||
      sampleCount <= 0 ||
      !Number.isFinite(distance) ||
      distance <= 0
    ) {
      return;
    }

    totalDistance += distance;
    totalTravelTime += distance / speed;
  });

  return totalTravelTime > 0 ? totalDistance / totalTravelTime : null;
}

export function buildHourlySpeedSeries(
  edges,
  histories,
  distancesKm,
  todayWeekday,
) {
  const bucketMaps = histories.map(getBucketMap);
  const today = [];
  const average = [];

  for (let hour = 0; hour < 24; hour += 1) {
    today.push(
      getCorridorSpeed(edges, bucketMaps, distancesKm, todayWeekday, hour),
    );

    const dailySpeeds = [];
    for (let day = 0; day < 7; day += 1) {
      const speed = getCorridorSpeed(edges, bucketMaps, distancesKm, day, hour);
      if (speed !== null) dailySpeeds.push(speed);
    }
    average.push(
      dailySpeeds.length
        ? dailySpeeds.reduce((sum, speed) => sum + speed, 0) /
            dailySpeeds.length
        : null,
    );
  }

  return { today, average };
}
