export default function Template5({ personal, declarationDate, place }) {
  return (
    <div className="print-page">
      <style>{`
        .t5 *{box-sizing:border-box}
        .t5{width:210mm;min-height:297mm;margin:20px auto;background:#fff;border:3px solid #222;position:relative;padding:14px 22px 46px;font-family:"Times New Roman",serif;page-break-after:always}
        .t5 .inner{border:1px solid #222;padding:8px 18px 120px;min-height:279mm}
        .t5 h1{margin:0;text-align:center;font-size:30px;font-weight:700}
        .t5 .sub{text-align:center;font-size:12px;margin-top:6px}
        .t5 .red{height:3px;background:#7f2d2d;margin:8px 8px 6px}
        .t5 p{margin:4px 0;font-size:13px;line-height:1.32;text-align:justify}
        .t5 .b{font-weight:bold}
        .t5 .blue{font-size:22px;color:#29446f;text-align:center;font-weight:bold;margin:18px 0 10px}
        .t5 .row{font-size:13px;margin:2px 0}
        .t5 .line{display:inline-block;border-bottom:1px solid #000;min-width:120px;height:16px;vertical-align:bottom;padding-left:4px}
        .t5 .long{min-width:230px}
        .t5 .med{min-width:180px}
        .t5 .small{min-width:80px}
        .t5 .sigwrap{display:flex;justify-content:space-between;margin-top:45px}
        .t5 .sig{width:260px}
        .t5 .sig .l{border-bottom:1px solid #000;height:24px}
        .t5 .sig div:last-child{text-align:left;font-size:12px;margin-top:4px}
        .t5 .footer{border-top:2px solid #8b3434;padding-top:6px;text-align:center;font-size:11px;color:#333;margin-top:20px}
      `}</style>
      <div className="t5">
        <div className="inner">
          <h1>Being Sevak Charitable Trust</h1>
          <div className="red"></div>
          <div className="sub">Public Charitable Trust (Reg.) E-31948 No, Income Tax Exempted Under 80G</div>

          <p><span className="b">4. Withdrawal of Consent:</span> I may withdraw this consent by written request; withdrawal applies only to future publications where reasonably practicable and does not affect materials already published or archived.</p>
          <p><span className="b">5. Declaration:</span> I am signing voluntarily without pressure or coercion, have read and understood this form, and agree to all its terms. It is governed by the laws of India, with exclusive jurisdiction of the competent courts at Mumbai, Maharashtra.</p>

          <div className="row">Full Name: <span className="line med">{personal.fullName || ''}</span> &nbsp;&nbsp; Mobile: <span className="line">{personal.phone || ''}</span> &nbsp;&nbsp; Email: <span className="line med">{personal.email || ''}</span></div>
          <div className="row">Residential Address: <span className="line long" style={{minWidth:540}}>{personal.address || ''}</span></div>
          <div className="row">Signature of Volunteer: <span className="line"></span> &nbsp; Date: <span className="line small">{declarationDate || ''}</span> &nbsp; Place: <span className="line">{place || ''}</span></div>
          <div className="row"><span className="b">For Minors (below 18 years):</span> I, <span className="line"></span>, parent/legal guardian of the above volunteer, consent on the minor's behalf. Signature: <span className="line"></span> Relationship: <span className="line small"></span></div>
          <div className="row"><span className="b">For Being Sevak Charitable Trust (Authorized Signatory)</span> — Name: <span className="line"></span> Designation: <span className="line"></span></div>

          <div className="blue">DATA RULES &amp; GUIDELINES</div>
          <p><span className="b">Data Ownership &amp; Usage:</span> Data assigned to a volunteer remains strictly under that volunteer's responsibility. If the volunteer is absent, the HOD may temporarily reassign the data to another volunteer, who may use it for calling and lead generation with one-day follow-up authority; leads generated in this period are credited to the acting volunteer. Working on another volunteer's data without authorization is not allowed. <span className="b">Follow-Ups During Leave:</span> a maximum of 3 follow-ups by another volunteer is allowed on the assigned data. <span className="b">Lead Clash Policy:</span> a conflicting lead is assigned to the volunteer who originally owns the data; the Admin Department has final authority to decide such cases. <span className="b">Queries &amp; Issues:</span> contact the Operational Manager.</p>

          <div className="blue">VOLUNTEER CONFIDENTIALITY / NON-DISCLOSURE AGREEMENT</div>
          <p>This agreement is made between Being Sevak Charitable Trust and the Volunteer on <span className="line med">{declarationDate || ''}</span>. While performing services for the Trust, the Volunteer may receive Confidential Information concerning matters affecting or relating to the Trust. The Volunteer agrees as follows:</p>
          <p><span className="b">A.</span> Confidential Information and Proprietary Data are secrets of the Trust and its exclusive property. The Volunteer shall keep them confidential, take reasonable steps to protect them and not disclose or use them for personal benefit or the benefit of others during or after association with the Trust.</p>
          <p><span className="b">B.</span> Notes, notebooks, computer disks, pen drives, documents, equipment and devices containing such information are the property of the Trust and must not be removed from Trust premises. They shall be returned immediately upon termination.</p>
          <p><span className="b">C.</span> The Volunteer shall not reproduce or commercially use Confidential Information for any purpose other than performing duties for the Trust.</p>
          <p><span className="b">D.</span> The Trust may take disciplinary action, including termination, and pursue civil or criminal remedies for violations. This agreement is governed by the laws of Maharashtra (Mumbai).</p>
          <p><span className="b">E.</span> On resignation, the Volunteer shall surrender all office assets, official WhatsApp, email ID, contact number and other Trust-related items. Failure to comply may result in legal action.</p>
          <p><span className="b">F.</span> All provisions apply only to the extent they do not violate applicable law. The Volunteer warrants that no conflicting obligation exists.</p>
          <p>Signing below signifies that the Volunteer agrees to the terms and conditions stated above.</p>

          <div className="sigwrap">
            <div className="sig"><div className="l"></div><div>Volunteer Name &amp; Signature</div></div>
            <div className="sig"><div className="l"></div><div>For Being Sevak Charitable Trust (Authorized Signatory)</div></div>
          </div>
        </div>
        <div className="footer">
          Reg. Add.: Office No. 402, 4th Floor, 'A' Wing, New Delite Apartment, Near Chandavarkar Lane, Borivali (West), Mumbai.<br />
          Contact Sevak: 8879035035 / 8879034034 | E-Mail: being.sevak@gmail.com | Website: www.beingsevak.org
        </div>
      </div>
    </div>
  );
}
