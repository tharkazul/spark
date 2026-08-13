import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Activity } from '../types/activity';

export async function exportActivitiesToCSV(activities: Activity[]): Promise<boolean> {
  if (!activities || activities.length === 0) {
    throw new Error('No activities available to export.');
  }

  // Generate CSV rows
  let csvContent = 'ID,Date,Sport,Title,Distance_km,Duration_mins,Spark_Score,Avg_HR,Max_HR,Elevation_m\n';

  activities.forEach((act) => {
    const id = act.id || '';
    const date = act.start_date ? act.start_date.substring(0, 10) : '';
    const sport = act.sport_type || 'Activity';
    const title = `"${(act.name || 'Workout').replace(/"/g, '""')}"`;
    const dist = typeof act.distance_km === 'number' ? act.distance_km.toFixed(2) : '0';
    const dur = typeof act.moving_time_min === 'number' ? act.moving_time_min.toFixed(1) : '0';
    const spark = act.spark_score || act.tss || 0;
    const avgHr = act.average_heartrate || '';
    const maxHr = act.max_heartrate || '';
    const elev = act.elevation_m || 0;

    csvContent += `${id},${date},${sport},${title},${dist},${dur},${spark},${avgHr},${maxHr},${elev}\n`;
  });

  const file = new File(Paths.cache, 'spark_workout_history.csv');
  if (file.exists) {
    file.delete();
  }
  file.create();
  file.write(csvContent);

  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(file.uri, {
      mimeType: 'text/csv',
      dialogTitle: 'Export Spark Workout History',
      UTI: 'public.comma-separated-values-text',
    });
    return true;
  } else {
    throw new Error('Sharing is not available on this device.');
  }
}
