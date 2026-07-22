<?php

namespace App\Http\Controllers;

use App\Models\Attendance;
use App\Models\Member;
use App\Models\Plan;
use App\Models\SyncConflictLog;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class SyncController extends Controller
{
    /**
     * Process a batch of write queue operations synced from the client.
     */
    public function sync(Request $request)
    {
        $request->validate([
            'queue' => 'required|array',
            'queue.*.id' => 'required', // Client's queue ID (often numeric or uuid)
            'queue.*.uuid' => 'required|uuid',
            'queue.*.table' => 'required|string|in:members,plans,attendances',
            'queue.*.action' => 'required|string|in:create,update,delete',
            'queue.*.payload' => 'required|array',
            'queue.*.timestamp' => 'required|date',
        ]);

        $queue = $request->input('queue');
        $syncedIds = [];
        $conflicts = [];

        DB::transaction(function () use ($queue, &$syncedIds, &$conflicts) {
            foreach ($queue as $item) {
                $clientQueueId = $item['id'];
                $uuid = $item['uuid'];
                $table = $item['table'];
                $action = $item['action'];
                $payload = $item['payload'];
                $clientTimestamp = Carbon::parse($item['timestamp']);

                // Force the record primary ID to match the client-generated UUID
                $payload['id'] = $uuid;

                if ($table === 'plans') {
                    $plan = Plan::find($uuid);

                    if ($plan) {
                        $serverUpdatedAt = $plan->updated_at;

                        if ($clientTimestamp->lt($serverUpdatedAt)) {
                            // Client change is older. Log conflict, skip update, keep server version.
                            SyncConflictLog::create([
                                'table_name' => 'plans',
                                'record_id' => $uuid,
                                'client_payload' => $payload,
                                'server_payload' => $plan->toArray(),
                                'resolved' => false,
                            ]);
                            $conflicts[] = $uuid;
                            $syncedIds[] = $clientQueueId;
                            continue;
                        }

                        $plan->update($payload);
                    } else {
                        Plan::create($payload);
                    }
                } elseif ($table === 'members') {
                    $member = Member::find($uuid);

                    if ($member) {
                        $serverUpdatedAt = $member->updated_at;

                        if ($clientTimestamp->lt($serverUpdatedAt)) {
                            // Client change is older. Log conflict, skip update, keep server version.
                            SyncConflictLog::create([
                                'table_name' => 'members',
                                'record_id' => $uuid,
                                'client_payload' => $payload,
                                'server_payload' => $member->toArray(),
                                'resolved' => false,
                            ]);
                            $conflicts[] = $uuid;
                            $syncedIds[] = $clientQueueId;
                            continue;
                        }

                        $member->update($payload);
                    } else {
                        Member::create($payload);
                    }
                } elseif ($table === 'attendances') {
                    $attendance = Attendance::find($uuid);

                    if (!$attendance) {
                        // Append-only, create if not already present.
                        Attendance::create($payload);
                    }
                }

                $syncedIds[] = $clientQueueId;
            }
        });

        return response()->json([
            'success' => true,
            'synced_ids' => $syncedIds,
            'conflicts' => $conflicts,
        ]);
    }
}
