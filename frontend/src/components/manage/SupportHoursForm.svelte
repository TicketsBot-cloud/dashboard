<script>
    import { createEventDispatcher, onMount } from "svelte";
    import BetaAlert from "../BetaAlert.svelte";

    export let data = [];

    const dispatch = createEventDispatcher();
    const daysOfWeek = [
        "Sunday",
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
    ];

    let hours = daysOfWeek.map((_, index) => ({
        day_of_week: index,
        enabled: false,
        start_time: "09:00",
        end_time: "17:00",
    }));

    onMount(() => {
        if (data && data.length > 0) {
            data.forEach((item) => {
                if (item.day_of_week >= 0 && item.day_of_week < 7) {
                    hours[item.day_of_week] = {
                        day_of_week: item.day_of_week,
                        enabled: item.enabled,
                        start_time: formatTime(item.start_time),
                        end_time: formatTime(item.end_time),
                    };
                }
            });
        }
    });

    function formatTime(timeString) {
        if (!timeString) return "09:00";
        // If it's already in HH:MM format, return as is
        if (timeString.match(/^\d{2}:\d{2}$/)) {
            return timeString;
        }
        // If it's in HH:MM:SS format, remove seconds
        if (timeString.match(/^\d{2}:\d{2}:\d{2}$/)) {
            return timeString.substring(0, 5);
        }
        return "09:00";
    }

    function handleDayToggle(index) {
        if (!hours[index].enabled) {
            // Set default hours when enabling
            hours[index].start_time = "09:00";
            hours[index].end_time = "17:00";
        }
        emitChange();
    }

    function validateTimeRange(index) {
        const start = hours[index].start_time;
        const end = hours[index].end_time;

        if (start && end && start >= end) {
            // If start is after end, set end to 1 hour after start
            const [startHour, startMin] = start.split(":").map(Number);
            let endHour = startHour + 1;
            if (endHour >= 24) endHour = 23;
            hours[index].end_time =
                `${String(endHour).padStart(2, "0")}:${String(startMin).padStart(2, "0")}`;
        }
        emitChange();
    }

    function copyToAllWeekdays() {
        const mondayHours = hours[1]; // Monday is index 1
        if (!mondayHours.enabled) return;

        // Copy to Tuesday through Friday (indices 2-5)
        for (let i = 2; i <= 5; i++) {
            hours[i] = {
                day_of_week: i,
                enabled: true,
                start_time: mondayHours.start_time,
                end_time: mondayHours.end_time,
            };
        }
        hours = hours; // Trigger reactivity
        emitChange();
    }

    function setBusinessHours() {
        // Set Monday through Friday 9:00-17:00
        for (let i = 1; i <= 5; i++) {
            hours[i] = {
                day_of_week: i,
                enabled: true,
                start_time: "09:00",
                end_time: "17:00",
            };
        }
        // Weekend closed
        hours[0].enabled = false;
        hours[6].enabled = false;

        hours = hours; // Trigger reactivity
        emitChange();
    }

    function clearAll() {
        hours = daysOfWeek.map((_, index) => ({
            day_of_week: index,
            enabled: false,
            start_time: "09:00",
            end_time: "17:00",
        }));
        emitChange();
    }

    function emitChange() {
        const enabledHours = hours
            .filter((h) => h.enabled)
            .map((h) => ({
                day_of_week: h.day_of_week,
                start_time: `${h.start_time}:00`, // Add seconds for backend
                end_time: `${h.end_time}:00`,
                enabled: true,
            }));
        dispatch("change", enabledHours);
    }

    // Export function to get current data
    export function getData() {
        return hours
            .filter((h) => h.enabled)
            .map((h) => ({
                day_of_week: h.day_of_week,
                start_time: `${h.start_time}:00`,
                end_time: `${h.end_time}:00`,
                enabled: true,
            }));
    }
</script>

<div class="support-hours-container">
    <div class="form-group">
        <div class="info-section">
            <div class="utc-notice">
                <i class="fas fa-clock"></i>
                <span>All times are in UTC</span>
            </div>
            {#if !hours.some((h) => h.enabled)}
                <div class="default-notice">
                    <i class="fas fa-check-circle"></i>
                    <span>Panel is available 24/7 (no restrictions)</span>
                </div>
            {:else}
                <div class="restriction-notice">
                    <i class="fas fa-info-circle"></i>
                    <span
                        >Panel availability is restricted to configured hours</span
                    >
                </div>
            {/if}
        </div>
        <BetaAlert style="width: 100%" />
        <div class="days-container">
            {#each daysOfWeek as day, index}
                <div class="day-row" class:enabled={hours[index].enabled}>
                    <div class="day-info">
                        <div class="day-checkbox">
                            <input
                                type="checkbox"
                                id="day-{index}"
                                bind:checked={hours[index].enabled}
                                on:change={() => handleDayToggle(index)}
                            />
                            <label for="day-{index}" class="day-label">
                                {day}
                            </label>
                        </div>
                    </div>

                    <div class="time-section">
                        {#if hours[index].enabled}
                            <div class="time-inputs">
                                <input
                                    type="time"
                                    bind:value={hours[index].start_time}
                                    on:change={() => validateTimeRange(index)}
                                    class="time-input"
                                    aria-label="Start time for {day}"
                                />
                                <span class="time-separator">to</span>
                                <input
                                    type="time"
                                    bind:value={hours[index].end_time}
                                    on:change={() => validateTimeRange(index)}
                                    class="time-input"
                                    aria-label="End time for {day}"
                                />
                            </div>
                        {:else if hours.some((h) => h.enabled)}
                            <div class="status-label closed">Closed</div>
                        {:else}
                            <div class="status-label open-24-7">24/7</div>
                        {/if}
                    </div>
                </div>
            {/each}
        </div>

        <div class="actions">
            <button
                class="action-button"
                on:click={copyToAllWeekdays}
                disabled={!hours[1].enabled}
                title="Copy Monday's hours to Tuesday through Friday"
            >
                <i class="fas fa-copy"></i>
                Copy to weekdays
            </button>
            <button
                class="action-button"
                on:click={setBusinessHours}
                title="Set standard business hours (Mon-Fri 9:00-17:00)"
            >
                <i class="fas fa-briefcase"></i>
                Business hours
            </button>
            <button
                class="action-button secondary"
                on:click={clearAll}
                title={hours.some((h) => h.enabled)
                    ? "Remove all restrictions (return to 24/7)"
                    : "Clear settings"}
            >
                <i class="fas fa-times"></i>
                {hours.some((h) => h.enabled) ? "Set 24/7" : "Clear all"}
            </button>
        </div>
    </div>
</div>

<style>
    .support-hours-container {
        width: 100%;
    }

    .form-group {
        display: flex;
        flex-direction: column;
        gap: 16px;
    }

    .info-section {
        display: flex;
        gap: 12px;
        flex-wrap: wrap;
    }

    .utc-notice,
    .default-notice,
    .restriction-notice {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        background: rgba(255, 255, 255, 0.05);
        border-radius: 6px;
        font-size: 13px;
        color: rgba(255, 255, 255, 0.7);
    }

    .utc-notice i {
        color: #4fc3f7;
    }

    .default-notice i {
        color: #81c784;
    }

    .restriction-notice i {
        color: #ffb74d;
    }

    .days-container {
        display: flex;
        flex-direction: column;
        gap: 2px;
        background: rgba(0, 0, 0, 0.2);
        border-radius: 8px;
        padding: 2px;
    }

    .day-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 16px;
        background: #2a2a2a;
        border-radius: 6px;
        transition: all 0.2s ease;
    }

    .day-row.enabled {
        background: #2d3142;
    }

    .day-row:hover {
        background: #323232;
    }

    .day-row.enabled:hover {
        background: #353849;
    }

    .day-info {
        display: flex;
        align-items: center;
        gap: 12px;
        flex: 1;
    }

    .day-checkbox {
        display: flex;
        align-items: center;
        gap: 12px;
    }

    .day-checkbox input[type="checkbox"] {
        width: 18px;
        height: 18px;
        cursor: pointer;
        accent-color: #66bb6a;
    }

    .day-label {
        font-weight: 500;
        font-size: 14px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        color: rgba(255, 255, 255, 0.9);
        cursor: pointer;
        user-select: none;
        min-width: 100px;
    }

    .time-section {
        display: flex;
        align-items: center;
    }

    .time-inputs {
        display: flex;
        align-items: center;
        gap: 12px;
    }

    .time-input {
        padding: 6px 10px;
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 4px;
        background: rgba(0, 0, 0, 0.3);
        color: rgba(255, 255, 255, 0.9);
        font-size: 14px;
        font-family: "SF Mono", "Monaco", "Inconsolata", "Fira Code", monospace;
        transition: all 0.2s ease;
    }

    .time-input:hover {
        border-color: rgba(255, 255, 255, 0.2);
        background: rgba(0, 0, 0, 0.4);
    }

    .time-input:focus {
        outline: none;
        border-color: #66bb6a;
        background: rgba(0, 0, 0, 0.5);
    }

    .time-separator {
        color: rgba(255, 255, 255, 0.4);
        font-size: 13px;
    }

    .status-label {
        padding: 6px 14px;
        border-radius: 4px;
        font-size: 13px;
        font-weight: 500;
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }

    .status-label.closed {
        background: rgba(244, 67, 54, 0.15);
        color: #ef5350;
    }

    .status-label.open-24-7 {
        background: rgba(79, 195, 247, 0.15);
        color: #4fc3f7;
    }

    .actions {
        display: flex;
        gap: 8px;
        padding-top: 8px;
        border-top: 1px solid rgba(255, 255, 255, 0.1);
    }

    .action-button {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 14px;
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 6px;
        color: rgba(255, 255, 255, 0.8);
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s ease;
    }

    .action-button:hover:not(:disabled) {
        background: rgba(255, 255, 255, 0.12);
        border-color: rgba(255, 255, 255, 0.2);
        color: rgba(255, 255, 255, 0.95);
    }

    .action-button.secondary {
        background: rgba(244, 67, 54, 0.1);
        border-color: rgba(244, 67, 54, 0.2);
        color: #ef5350;
    }

    .action-button.secondary:hover:not(:disabled) {
        background: rgba(244, 67, 54, 0.15);
        border-color: rgba(244, 67, 54, 0.3);
    }

    .action-button:disabled {
        opacity: 0.4;
        cursor: not-allowed;
    }

    .action-button i {
        font-size: 12px;
    }

    @media (max-width: 768px) {
        .info-section {
            flex-direction: column;
        }

        .utc-notice,
        .default-notice {
            width: 100%;
        }

        .day-row {
            flex-direction: column;
            align-items: flex-start;
            gap: 12px;
        }

        .time-section {
            width: 100%;
        }

        .time-inputs {
            width: 100%;
            justify-content: space-between;
        }

        .actions {
            flex-direction: column;
        }

        .action-button {
            width: 100%;
            justify-content: center;
        }
    }
</style>
