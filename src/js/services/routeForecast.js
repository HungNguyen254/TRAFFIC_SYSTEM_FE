export async function forecastRoute(route, baseTime, weather, requestForecast) {
  if (!Array.isArray(route?.steps) || route.steps.length === 0) {
    throw new Error("Tuyến đường không có đoạn đường để dự báo.");
  }

  const steps = route.steps.map((step) => {
    const baselineMinutes = Number(step.travel_min);
    if (
      !step.edge_id ||
      !Number.isFinite(baselineMinutes) ||
      baselineMinutes < 0
    ) {
      throw new Error("Dữ liệu đoạn đường không hợp lệ để tính thời gian dự kiến.");
    }

    return {
      edge_id: step.edge_id,
      baseline_travel_min: baselineMinutes,
    };
  });
  const forecast = await requestForecast({
    base_time: baseTime,
    weather,
    steps,
  });
  const predictedDuration = Number(forecast?.predicted_duration_min);
  if (
    !Number.isFinite(predictedDuration) ||
    predictedDuration <= 0 ||
    !Array.isArray(forecast.steps) ||
    forecast.steps.length !== route.steps.length
  ) {
    throw new Error("Không nhận được kết quả dự báo hợp lệ cho tuyến đường.");
  }

  const stepDetails = route.steps.map((step, index) => {
    const prediction = forecast.steps[index];
    const predictedSpeed = Number(prediction?.predicted_speed);
    const predictedMinutes = Number(prediction?.predicted_minutes);
    if (
      prediction?.edge_id !== step.edge_id ||
      !Number.isFinite(predictedSpeed) ||
      predictedSpeed <= 0 ||
      !Number.isFinite(predictedMinutes) ||
      predictedMinutes <= 0
    ) {
      throw new Error(`Không có tốc độ dự báo hợp lệ cho đoạn "${step.street_name}".`);
    }

    return {
      ...step,
      predicted_speed: predictedSpeed,
      predicted_min: predictedMinutes,
      congestion_level: prediction.congestion_level,
      target_time: prediction.target_time,
    };
  });

  return { predictedDuration, stepDetails };
}
