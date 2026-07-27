<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class StaffInvitationMail extends Mailable
{
    use Queueable, SerializesModels;

    public string $activationUrl;
    public string $userName;

    /**
     * Create a new message instance.
     */
    public function __construct(string $activationUrl, string $userName)
    {
        $this->activationUrl = $activationUrl;
        $this->userName = $userName;
    }

    /**
     * Get the message envelope.
     */
    public function envelope(): Envelope
    {
        return new Envelope(
            subject: 'Staff Invitation - Join Gym Management System',
        );
    }

    /**
     * Get the message content definition.
     */
    public function content(): Content
    {
        return new Content(
            htmlString: "
                <div style='font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;'>
                    <h2 style='color: #4f46e5; margin-top: 0;'>Welcome to the Team, {$this->userName}!</h2>
                    <p style='color: #374151; font-size: 16px; line-height: 1.5;'>
                        You have been invited to join the Gym Management System as a staff member. Please click the button below to complete your registration and set up your password:
                    </p>
                    <div style='text-align: center; margin: 30px 0;'>
                        <a href='{$this->activationUrl}' style='background-color: #4f46e5; color: #ffffff; padding: 12px 24px; font-weight: bold; border-radius: 6px; text-decoration: none; display: inline-block;'>
                            Accept Staff Invitation
                        </a>
                    </div>
                    <p style='color: #6b7280; font-size: 14px;'>
                        If the button above does not work, copy and paste this link into your browser:<br>
                        <a href='{$this->activationUrl}' style='color: #4f46e5;'>{$this->activationUrl}</a>
                    </p>
                    <hr style='border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;'>
                    <p style='color: #9ca3af; font-size: 12px; text-align: center;'>
                        This invitation link is valid for 3 days. If you did not request this invitation, please ignore this email.
                    </p>
                </div>
            "
        );
    }
}
